/**
 * Generates an image using the Chutes.ai API.
 *
 * @param {string} prompt - The prompt for the image generation.
 * @param {string} negative_prompt - The negative prompt for the image generation.
 * @returns {Promise<object>} The JSON response from the API.
 */
export async function generateImage(prompt, negative_prompt) {
  try {
    const response = await fetch("https://image.chutes.ai/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${import.meta.env.VITE_CHUTES_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "JuggernautXL",
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "guidance_scale": 7.5,
        "width": 720,
        "height": 1280,
        "num_inference_steps": 50
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onloadend = () => {
        console.log("Generated Image Data URL:", reader.result);
        resolve([{ type: "image", data: reader.result }]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
}