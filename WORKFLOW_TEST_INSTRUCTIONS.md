# Video Generation Workflow Test Instructions

## Overview
This document provides instructions for testing the video generation workflow before merging PR #5.

## Prerequisites
- Ensure `GEMINI_API_KEY` secret is configured in the repository settings
- The workflow has been updated to fix the apt-get package installation issue
- The `spawnSync` import bug has been fixed

## How to Test the Workflow

### Option 1: Manual Workflow Dispatch (Recommended)
1. Go to the GitHub repository: https://github.com/lohitsuri1/Lohit-Video-Workflow
2. Click on the "Actions" tab
3. Select "Generate Test Video with Gemini Veo" from the left sidebar
4. Click "Run workflow" button on the right
5. Select the `claude/fix-action-workflow-error` branch
6. Click "Run workflow"

### Option 2: Using GitHub CLI
```bash
gh workflow run generate-video.yml --repo lohitsuri1/Lohit-Video-Workflow --ref claude/fix-action-workflow-error
```

## Expected Behavior

### If API Key Has GCP Billing Enabled (Veo 2 Available)
1. The workflow will generate a video using Gemini Veo 2
2. Video generation may take 10-20 minutes (it's a long-running process)
3. A video artifact will be uploaded to the workflow run

### If API Key is Free Tier (No Billing)
1. The workflow will detect the billing limitation
2. It will automatically fall back to:
   - Generate a high-quality image using Imagen-3 (free tier)
   - Animate the image into a video using ffmpeg with Ken-Burns effect
3. This fallback is much faster (under 1 minute typically)
4. A video artifact will still be uploaded

## Verifying Success

After the workflow completes:

1. Check that the workflow status shows ✅ (green checkmark)
2. Click on the completed workflow run
3. Scroll to the bottom to find "Artifacts"
4. Download the `generated-video` artifact
5. Unzip and verify that `test-clip.mp4` plays correctly

## Fixed Issues in This Branch

### 1. FFmpeg Installation Failure (FIXED ✅)
**Problem:** The workflow was failing with 404 errors when installing ffmpeg
```
E: Failed to fetch mirror+file:/etc/apt/apt-mirrors.txt/pool/main/libv/libvpx/libvpx9_1.14.0-1ubuntu2.2_amd64.deb  404  Not Found
```

**Solution:** Added `apt-get update` before installing ffmpeg in `.github/workflows/generate-video.yml`

### 2. Missing Import (FIXED ✅)
**Problem:** The code was using `spawnSync` without importing it
**Solution:** Added `spawnSync` to the imports in `server/services/gemini-video.js`

## Troubleshooting

### Workflow Still Failing?
- Check that `GEMINI_API_KEY` is properly set in repository secrets
- Verify the API key is valid (test it locally or in Google Cloud Console)
- Check workflow logs for specific error messages

### Video Not Generated?
- If using free tier, the fallback mechanism should still create a video
- Check that the `library/videos/` directory exists (it should be created automatically)
- Verify ffmpeg installed successfully in the workflow logs

## Next Steps

Once the workflow runs successfully:
1. Verify the generated video looks acceptable
2. Merge PR #5 into main branch
3. The workflow will be available for future video generation tasks
