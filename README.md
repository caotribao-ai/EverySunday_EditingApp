<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/93490f4e-eef8-4127-a1a5-ed806da6bd51

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy on Render (Blueprint)

This repo includes a `render.yaml` Blueprint for:
- `snap-studio-web` (public API + frontend)
- `snap-studio-worker` (background jobs)

### Required environment variables on Render

Set these in Render Dashboard (they are marked `sync: false` in `render.yaml`):
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `PEXELS_API_KEY`
- `SEPAY_API_KEY`
- `REDIS_URL`
- `GOOGLE_CLOUD_PROJECT`
- `ADMIN_UIDS`

### Deployment steps

1. Push this repository to GitHub/GitLab/Bitbucket
2. Open: `https://dashboard.render.com/blueprint/new?repo=<YOUR_HTTPS_REPO_URL>`
3. Review resources from `render.yaml`
4. Fill required secrets
5. Click **Apply**
