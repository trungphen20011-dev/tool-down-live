# 🎬 TikTok Live Downloader & Stream Recorder (Port 1111)

Ứng dụng web local giúp bạn xem trước và tải / ghi video trực tiếp (Livestream) từ TikTok ở chất lượng gốc (Full HD / HD), hỗ trợ xuất trực tiếp định dạng **MP4** hoặc **FLV**.

---

## 🚀 Cách mở và sử dụng

1. **Truy cập trực tiếp trên trình duyệt:**
   👉 [http://localhost:1111](http://localhost:1111)

2. **Cách khởi động lại server sau này:**
   Mở Terminal và chạy:
   ```bash
   cd ~/Desktop/tiktok-live-downloader
   ./run.sh
   # hoặc: npm start
   ```

---

## ✨ Tính năng nổi bật

- ⚡ **Tự động nhận diện link Live:** Hỗ trợ link web TikTok (`https://www.tiktok.com/@topgiahcm/live?...`), link rút gọn (`vt.tiktok.com`), hoặc chỉ cần gõ username (`@topgiahcm`).
- 🎥 **Tải chuẩn MP4 không giảm chất lượng:** Tận dụng FFmpeg lossless stream-copy (`-c copy`), ghi trực tiếp thành file `.mp4` tương thích 100% với QuickTime, iPhone, Mac, Windows mà không tốn CPU máy.
- ⏱️ **Theo dõi Real-time:** Hiển thị thời gian ghi hình (REC timer), dung lượng file tăng dần theo thời gian thực (MB) và số người đang xem live.
- 👁️ **Xem trước trực tiếp (Live Preview Player):** Tích hợp Hls.js để xem trước luồng live ngay trên web trước khi bấm tải.
- 📂 **Tích hợp macOS Finder:** 1-click nút "Mở thư mục video (Finder)" để mở ngay thư mục lưu video trên Mac.
- 📺 **Trình phát lại nội bộ:** Xem lại ngay các video đã ghi ngay trên giao diện web mà không cần mở phần mềm ngoài.
- 📋 **Copy stream link:** Sao chép link M3U8 hoặc FLV để import vào OBS Studio hoặc VLC Media Player nếu cần.

---

## 📁 Thư mục lưu video
Tất cả video được lưu tại:
```
~/Desktop/tiktok-live-downloader/downloads/
```
