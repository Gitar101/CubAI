// Function to convert LaTeX code blocks to proper markdown math syntax
export const convertLatexCodeBlocks = (text) => {
  if (!text) return text;

  // Convert ```latex blocks to display math $$...$$
  // Handle both newline and non-newline cases
  let converted = text.replace(/```latex\s*\n?([\s\S]*?)\n?```/g, (_, formula) => {
    return `$$${formula.trim()}$$`;
  });

  // Convert \(...\) to $...$
  converted = converted.replace(/\\\((.*?)\\\)/g, (_, formula) => {
    return `$${formula}$`;
  });

  // Convert \[...\] to $$...$$
  converted = converted.replace(/\\\[([\s\S]*?)\\]/g, (_, formula) => {
    return `$$${formula.trim()}$$`;
  });

  return converted;
};