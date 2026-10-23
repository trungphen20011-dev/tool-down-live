const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { TikTokLiveConnection } = require('tiktok-live-connector');

const app = express();
const PORT = 1111;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Store active recording sessions
// { [id]: { id, username, title, filename, filepath, startTime, process, size: 0, status: 'recording' } }
const activeRecordings = new Map();

// Helper to extract username from URL or text
async function resolveUsername(input) {
  if (!input) return null;
  input = input.trim();

  // If it is a TikTok short URL (vt.tiktok.com or vm.tiktok.com), resolve redirect
  if (input.includes('vt.tiktok.com') || input.includes('vm.tiktok.com')) {
    try {
      const resp = await fetch(input, { method: 'HEAD', redirect: 'follow' });
      input = resp.url;
    } catch (e) {
      console.warn('Failed to resolve short URL:', e.message);
    }
  }

  // Extract from @username pattern in URL or text
  const match = input.match(/@([a-zA-Z0-9_.-]+)/);
  if (match) return match[1];

  // If plain username was provided
  const clean = input.replace(/^https?:\/\/(www\.)?tiktok\.com\//, '').replace(/\/live.*$/, '').replace(/[@\/]/g, '');
  return clean || null;
}

// 1. Get Room Information
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Vui lòng cung cấp link hoặc username TikTok Live' });
  }

  try {
    const username = await resolveUsername(url);
    if (!username) {
      return res.status(400).json({ error: 'Không tìm thấy username TikTok hợp lệ từ liên kết' });
    }

    console.log(`[INFO] Fetching room for @${username}...`);
    const connection = new TikTokLiveConnection(username, {});
    const roomResponse = await connection.fetchRoomInfo();
    const room = roomResponse?.data || roomResponse;

    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin phòng live' });
    }

    const isLive = room.status === 2;
    const streamUrl = room.stream_url || {};

    // Collect available stream options
    const streams = [];
    if (streamUrl.flv_pull_url && typeof streamUrl.flv_pull_url === 'object') {
      for (const [quality, streamLink] of Object.entries(streamUrl.flv_pull_url)) {
        streams.push({
          quality,
          label: `FLV - ${quality}`,
          url: streamLink,
          type: 'flv'
        });
      }
    }

    if (streamUrl.rtmp_pull_url) {
      streams.unshift({
        quality: 'DEFAULT_HD',
        label: 'FLV - Mặc định (Khuyên dùng)',
        url: streamUrl.rtmp_pull_url,
        type: 'flv'
      });
    }

    if (streamUrl.hls_pull_url) {
      streams.push({
        quality: 'HLS',
        label: 'HLS (m3u8)',
        url: streamUrl.hls_pull_url,
        type: 'hls'
      });
    }

    const info = {
      username: username,
      nickname: room.owner?.nickname || username,
      avatar: room.owner?.avatar_thumb?.url_list?.[0] || room.owner?.avatar_medium?.url_list?.[0] || null,
      bio: room.owner?.bio_description || '',
      title: room.title || 'TikTok Live Stream',
      userCount: room.user_count || 0,
      totalUsers: room.stats?.total_user || 0,
      likes: room.stats?.like_count || 0,
      isLive,
      statusText: isLive ? 'ĐANG LIVE' : 'ĐÃ KẾT THÚC / NGOẠI TUYẾN',
      hlsUrl: streamUrl.hls_pull_url || null,
      flvUrl: streamUrl.rtmp_pull_url || Object.values(streamUrl.flv_pull_url || {})[0] || null,
      streams
    };

    res.json(info);
  } catch (err) {
    console.error('[ERROR] /api/info:', err);
    res.status(500).json({
      error: `Lỗi kết nối TikTok Live: ${err.message || 'Không thể lấy dữ liệu'}. Vui lòng kiểm tra streamer có đang mở live không.`
    });
  }
});

// 2. Start Recording
app.post('/api/record/start', async (req, res) => {
  const { username, streamUrl, title, format = 'mp4' } = req.body;

  if (!streamUrl || !username) {
    return res.status(400).json({ error: 'Thiếu thông tin stream hoặc username' });
  }

  // Check if already recording this user
  for (const rec of activeRecordings.values()) {
    if (rec.username === username && rec.status === 'recording') {
      return res.status(400).json({ error: `@${username} đang được ghi hình rồi!` });
    }
  }

  const id = Date.now().toString();
  const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = format === 'flv' ? 'flv' : 'mp4';
  const filename = `${safeUsername}_${timestamp}.${ext}`;
  const filepath = path.join(DOWNLOADS_DIR, filename);

  console.log(`[RECORD START] Starting recording for @${username} -> ${filename}`);

  const ffmpegArgs = [
    '-y',
    '-headers', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n',
    '-i', streamUrl,
    '-c', 'copy'
  ];

  if (ext === 'mp4') {
    // faststart puts moov atom at beginning for immediate playback
    ffmpegArgs.push('-movflags', '+faststart');
  }

  ffmpegArgs.push(filepath);

  const ffProcess = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const session = {
    id,
    username,
    title: title || 'TikTok Live',
    filename,
    filepath,
    startTime: Date.now(),
    process: ffProcess,
    size: 0,
    status: 'recording',
    error: null
  };

  activeRecordings.set(id, session);

  ffProcess.stderr.on('data', () => {
    if (fs.existsSync(filepath)) {
      try {
        session.size = fs.statSync(filepath).size;
      } catch (e) {}
    }
  });

  ffProcess.on('error', (err) => {
    console.error(`[RECORD ERROR] FFmpeg error for ${id}:`, err);
    session.status = 'error';
    session.error = err.message;
  });

  ffProcess.on('close', (code) => {
    console.log(`[RECORD FINISHED] FFmpeg closed with code ${code} for ${id}`);
    session.status = 'finished';
    if (fs.existsSync(filepath)) {
      try {
        session.size = fs.statSync(filepath).size;
      } catch (e) {}
    }
  });

  res.json({
    success: true,
    id,
    filename,
    startTime: session.startTime
  });
});

// 3. Stop Recording
app.post('/api/record/stop', (req, res) => {
  const { id } = req.body;
  const session = activeRecordings.get(id);

  if (!session) {
    return res.status(404).json({ error: 'Không tìm thấy phiên ghi hình này' });
  }

  if (session.status !== 'recording') {
    return res.json({ success: true, message: 'Phiên này đã kết thúc', session });
  }

  console.log(`[RECORD STOP] Stopping session ${id} (${session.filename})...`);

  try {
    // Send 'q' to FFmpeg for graceful stop
    session.process.stdin.write('q');
  } catch (e) {
    try {
      session.process.kill('SIGINT');
    } catch (e2) {}
  }

  // Backup kill if not exited after 2.5s
  setTimeout(() => {
    if (session.status === 'recording') {
      try {
        session.process.kill('SIGTERM');
      } catch (e) {}
      session.status = 'finished';
    }
  }, 2500);

  session.status = 'finished';

  setTimeout(() => {
    if (fs.existsSync(session.filepath)) {
      session.size = fs.statSync(session.filepath).size;
    }
  }, 1000);

  res.json({
    success: true,
    message: 'Đã dừng ghi hình và lưu video thành công!',
    filename: session.filename
  });
});

// 4. Get Status of Active & Completed Recordings
app.get('/api/recordings', (req, res) => {
  const activeList = [];
  for (const [id, s] of activeRecordings.entries()) {
    let currentSize = s.size;
    if (fs.existsSync(s.filepath)) {
      try {
        currentSize = fs.statSync(s.filepath).size;
      } catch (e) {}
    }

    activeList.push({
      id,
      username: s.username,
      title: s.title,
      filename: s.filename,
      startTime: s.startTime,
      durationSeconds: Math.floor((Date.now() - s.startTime) / 1000),
      size: currentSize,
      status: s.status,
      error: s.error
    });
  }

  // Also read files on disk in DOWNLOADS_DIR
  const filesOnDisk = [];
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    for (const f of files) {
      if (f.endsWith('.mp4') || f.endsWith('.flv') || f.endsWith('.ts')) {
        const fullPath = path.join(DOWNLOADS_DIR, f);
        const stat = fs.statSync(fullPath);
        filesOnDisk.push({
          filename: f,
          size: stat.size,
          createdAt: stat.birthtimeMs || stat.mtimeMs
        });
      }
    }
  } catch (e) {
    console.error('Error reading downloads directory:', e);
  }

  filesOnDisk.sort((a, b) => b.createdAt - a.createdAt);

  res.json({
    active: activeList.filter(item => item.status === 'recording'),
    allSessions: activeList,
    files: filesOnDisk
  });
});

// 5. Download Video File
app.get('/api/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(DOWNLOADS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).send('File không tồn tại');
  }

  res.download(filepath, filename);
});

// 6. Stream/Watch Video File in Browser
app.get('/api/stream/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(DOWNLOADS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).send('File không tồn tại');
  }

  const stat = fs.statSync(filepath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filepath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': filename.endsWith('.mp4') ? 'video/mp4' : 'video/x-flv'
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': filename.endsWith('.mp4') ? 'video/mp4' : 'video/x-flv'
    };
    res.writeHead(200, head);
    fs.createReadStream(filepath).pipe(res);
  }
});

// 7. Open Downloads Folder in macOS Finder
app.post('/api/open-folder', (req, res) => {
  const { filename } = req.body || {};
  let cmd = `open "${DOWNLOADS_DIR}"`;
  if (filename) {
    const filepath = path.join(DOWNLOADS_DIR, path.basename(filename));
    if (fs.existsSync(filepath)) {
      cmd = `open -R "${filepath}"`;
    }
  }

  exec(cmd, (err) => {
    if (err) {
      console.error('Failed to open Finder:', err);
      return res.status(500).json({ error: 'Không thể mở thư mục' });
    }
    res.json({ success: true });
  });
});

// 8. Delete Video File
app.delete('/api/recordings/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(DOWNLOADS_DIR, filename);

  if (fs.existsSync(filepath)) {
    try {
      fs.unlinkSync(filepath);
      return res.json({ success: true, message: `Đã xóa ${filename}` });
    } catch (e) {
      return res.status(500).json({ error: 'Không thể xóa file' });
    }
  }
  res.status(404).json({ error: 'File không tồn tại' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
=====================================================
🚀 TikTok Live Stream Downloader Web App
🌐 Local URL: http://localhost:${PORT}
📁 Thư mục lưu video: ${DOWNLOADS_DIR}
=====================================================
  `);
});
