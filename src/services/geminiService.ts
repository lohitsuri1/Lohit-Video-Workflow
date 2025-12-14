// Note: The GoogleGenAI import is removed because we now proxy requests to the backend.
// We keep the types for consistency in the frontend.

export interface GenerateImageParams {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  imageBase64?: string | string[]; // Supports single image or array of images
  imageModel?: string; // Image model version (e.g., 'gemini-pro', 'kling-v2')
}

export interface GenerateVideoParams {
  prompt: string;
  imageBase64?: string; // For Image-to-Video (start frame)
  lastFrameBase64?: string; // For frame-to-frame interpolation (end frame)
  aspectRatio?: string;
  resolution?: string; // Add resolution to params
  videoModel?: string; // Video model version (e.g., 'veo-3.1', 'kling-v2-1')
}

/**
 * Generates an image by calling the backend API
 */
export const generateImage = async (params: GenerateImageParams): Promise<string> => {
  try {
    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || response.statusText);
    }

    const data = await response.json();
    if (!data.resultUrl) {
      throw new Error("No image data returned from server");
    }
    return data.resultUrl;

  } catch (error) {
    console.error("Gemini Image Gen Error:", error);
    throw error;
  }
};

/**
 * Generates a video by calling the backend API
 */
export const generateVideo = async (params: GenerateVideoParams): Promise<string> => {
  try {
    const response = await fetch('/api/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || response.statusText);
    }

    const data = await response.json();
    if (!data.resultUrl) {
      throw new Error("No video data returned from server");
    }
    return data.resultUrl;

  } catch (error) {
    console.error("Gemini Video Gen Error:", error);
    throw error;
  }
};