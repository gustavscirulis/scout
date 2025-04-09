export const ANALYSIS_PROMPT_TEMPLATE = `Analyze this webpage to determine if the following is true: "{criteria}". Check elements like prices, availability, text content, and other visible information.`;

export const DEFAULT_CRITERIA = {
  PRICE_DROP: 'the price of [product name] is below [target price]',
  BACK_IN_STOCK: 'size [your size] is available for [product name]',
  NEW_CONTENT: 'a [job title] position is available in [location]'
};

export function getAnalysisPrompt(criteria: string): string {
  return ANALYSIS_PROMPT_TEMPLATE.replace('{criteria}', criteria);
} 