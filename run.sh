#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"
echo "Starting TikTok Live Downloader on http://localhost:1111 ..."
open "http://localhost:1111"
node server.js
