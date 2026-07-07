# smmc-file-upload

一个可切换目标 Google Drive folder 的文件上传网站。普通用户打开上传链接提交文件；管理员打开 `/admin`，输入 `ADMIN_TOKEN` 后可以创建多个 event，每个 event 都有自己的上传链接和 Google Drive folder。

## 运行

```bash
npm install
cp .env.example .env
npm start
```

Windows PowerShell 可以手动复制 `.env.example` 为 `.env`。

然后打开：

```text
http://localhost:3000
```

管理员界面：

```text
http://localhost:3000/admin
```

单独 event 上传链接：

```text
http://localhost:3000/e/acs
```

## Google Drive 设置

1. 到 Google Cloud Console 创建项目并启用 Google Drive API。
2. 创建 Service Account，并下载 JSON key。
3. 把 JSON key 放到项目目录，例如 `service-account.json`。
4. 在 `.env` 设置：

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
ADMIN_TOKEN=换成一串很长的随机密钥
```

5. 在 Google Drive 里打开目标 folder，把该 service account 的 email 加为可编辑成员。
6. 从 folder URL 复制 folder ID：

```text
https://drive.google.com/drive/folders/FOLDER_ID_HERE
```

7. 启动网站，在右侧输入管理员密钥和 folder ID，点击保存并切换。

## 切换上传目标

Events 存在 `data/config.json`：

```json
{
  "activeEventId": "acs",
  "events": [
    {
      "id": "acs",
      "title": "活动标题",
      "folderId": "folder-id",
      "description": "显示在页面右上角的标签",
      "enabled": true
    }
  ]
}
```

你可以在 `/admin` 新增 event，复制每个 event 的上传链接，也可以直接编辑这个 JSON 后重启服务。

## 部署提醒

- 不要把 `.env` 或 service-account JSON 上传到公开仓库。
- 公开给用户使用前，建议放在 HTTPS 后面，例如 Render、Railway、Fly.io、VPS + Nginx。
- 如果要让不同用户上传到不同 folder，可以在后端把 `activeFolderId` 改成按账号、项目或 URL 参数选择。

## 参考

- Google Drive API 上传文件说明：<https://developers.google.com/workspace/drive/api/guides/manage-uploads>
- Google Drive `files.create`：<https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create>
- Google Service Account 说明：<https://developers.google.com/identity/protocols/oauth2/service-account>
