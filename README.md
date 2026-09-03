# 嘎嘎 Discord 免費雲端即時翻譯 Bot

這是一隻常駐 Oracle Cloud 的 Discord Bot。它會加入語音頻道，把每位成員的英文語音辨識成文字、翻成台灣繁體中文，再把雙語字幕貼到指定的 Discord 文字頻道。

你的電腦不需要保持開機。本方案使用 Oracle Always Free 主機及 Groq 免費 API 額度；只要不超過免費資源，就不會產生使用費。

## 功能

- `/join`：加入你目前所在的語音頻道並開始字幕。
- `/leave`：停止字幕並離開。
- `/status`：檢查 Discord 與 Groq API 設定。
- `/bothelp`：顯示簡短說明。
- 每位說話者分開顯示英文原文與繁中翻譯。
- Bot 不會把音訊寫成錄音檔。

```text
🎤 Kevin
🇺🇸 Can everyone hear me?
🇹🇼 大家聽得到我嗎？
```

## 免費額度與限制

Groq 免費方案目前對 `whisper-large-v3-turbo` 提供：

- 每分鐘 20 次語音請求
- 每天 2,000 次語音請求
- 每小時 7,200 秒（2 小時）音訊
- 每天 28,800 秒（8 小時）音訊

繁中翻譯預設使用 `openai/gpt-oss-20b`。它的免費限制包含每分鐘 30 次、每天 1,000 次請求，因此本 Bot 實際約可處理每天 1,000 段話。超過額度時不會扣款，但字幕會暫時失敗，等額度恢復後再使用。

Oracle Always Free 資源沒有到期日，但需要信用卡驗證身分、免費主機受地區容量限制，而且免費方案規則可能改變。建立主機時只能選標示 **Always Free-eligible** 的資源，不要手動升級成付費帳號。

## 需要準備

1. Discord Developer Portal：已建立的 GAGA Translate Bot。
2. GitHub：帳號 `Gaga020111`，用來安全存放沒有密鑰的程式碼。
3. Groq：免費 API Key。
4. Oracle Cloud：Always Free 帳號與主機。

`DISCORD_TOKEN` 和 `GROQ_API_KEY` 都是秘密。不要貼到 Discord、ChatGPT、截圖或 GitHub。

## 第一階段：建立 Groq API Key

1. 打開 <https://console.groq.com/keys>。
2. 登入或建立 Groq 帳號。
3. 點 **Create API Key**。
4. 名稱可輸入 `GAGA Discord Bot`。
5. 複製產生的 Key，暫時保存在安全的密碼管理工具中。

不要把 Groq Key 傳給任何人。安裝腳本稍後會讓你在 Oracle 終端機內用隱藏方式輸入。

## 第二階段：建立 Oracle 免費主機

1. 到 <https://www.oracle.com/cloud/free/> 申請 Oracle Cloud Free Tier。
2. 登入 Oracle Cloud Console。
3. 進入 **Compute → Instances → Create instance**。
4. 名稱輸入 `gaga-discord-bot`。
5. Image 選擇 **Ubuntu 24.04**。
6. Shape 選擇標示 **Always Free-eligible** 的 **Ampere A1 Flex**；建議 2 OCPU、12 GB RAM，不要超過免費額度。
7. 保留公用 IPv4 位址。
8. SSH Keys 選 **Generate a key pair for me**，下載並妥善保管 Private Key。
9. 建立後，記下主機的 **Public IP address**。

Bot 只需要主動連到 Discord 與 Groq，不需要額外開放網站連接埠。SSH 的 22 埠保留預設即可。

## 第三階段：把程式放上 GitHub

建立 GitHub repository：

```text
https://github.com/Gaga020111/gaga-discord-translator
```

程式庫可以設為 Public，因為所有密鑰都被 `.gitignore` 排除。若設為 Private，Oracle 下載程式時還要另外設定 GitHub 驗證，步驟會比較多。

## 第四階段：連線 Oracle 並安裝

在 Windows Terminal 或 PowerShell 輸入，請替換私鑰路徑與主機 IP：

```powershell
ssh -i "C:\Users\你的名稱\Downloads\oracle-key.key" ubuntu@你的主機IP
```

連上後，依序執行：

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Gaga020111/gaga-discord-translator.git
cd gaga-discord-translator
bash scripts/oracle-install.sh
```

安裝腳本會詢問三項資料：

1. Discord Bot Token
2. Groq API Key
3. Discord 伺服器 ID（可留白，但建議填）

輸入兩個密鑰時畫面不會顯示文字或星號，屬於正常安全設計。資料只會寫入 Oracle 主機內權限受限的 `.env`，不會上傳 GitHub。

## 邀請與使用 Bot

安裝完成後查看記錄：

```bash
sudo docker logs -f gaga-discord-translator
```

看到 `Discord Bot 已登入` 代表成功。記錄中會顯示一條「邀請 Bot」網址：

1. 複製網址到瀏覽器。
2. 選擇你的 Discord 伺服器並授權。
3. 先加入一個語音頻道。
4. 到要顯示字幕的文字頻道輸入 `/join`。
5. 說一個完整英文句子，稍等幾秒即可看到字幕。
6. 結束時輸入 `/leave`。

Bot 需要查看頻道、傳送訊息及連線權限。它只接收語音並貼出文字，不會在語音頻道播放聲音。

## 管理指令

查看狀態：

```bash
sudo docker ps
sudo docker logs --tail 100 gaga-discord-translator
```

重新啟動：

```bash
sudo docker restart gaga-discord-translator
```

更新程式：

```bash
cd ~/gaga-discord-translator
bash scripts/oracle-update.sh
```

## 常見問題

### Bot 顯示離線

查看 `sudo docker logs --tail 100 gaga-discord-translator`。最常見原因是 Discord Token 填錯或已被重設。

### `/join` 顯示沒有 Groq API Key

重新執行 `bash scripts/oracle-install.sh`，再輸入正確的 Groq Key。

### Bot 進得去，但沒有字幕

- 輸入 `/status`，確認 Discord 與 Groq API 都正常。
- 至少說一個完整英文句子。
- 確認 Bot 在文字頻道有查看及傳送訊息權限。
- 檢查是否超過 Groq 免費額度；API 會回覆 `429`。

### 看不到斜線指令

確認安裝時填入正確的 Discord 伺服器 ID，再重新執行安裝腳本。程式產生的邀請網址已包含 `applications.commands`。

## 隱私提醒

- Bot 不會將音訊寫入硬碟，但每段語音會送至 Groq API 做辨識及翻譯。
- 英文原文與繁中翻譯會貼到執行 `/join` 的文字頻道，能否看到由頻道權限決定。
- 正式活動開始前，請告知語音頻道內所有成員並取得必要同意。

## 技術組成

- Discord：`discord.js`、`@discordjs/voice`、DAVE 語音支援
- 語音解碼：`prism-media`、`opusscript`
- 英文辨識：Groq Speech-to-Text API、Whisper Large V3 Turbo
- 繁中翻譯：Groq Chat Completions API、GPT-OSS 20B
- 雲端：Oracle Cloud Always Free、Docker
