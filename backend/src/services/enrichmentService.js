/**
 * Third-Party API Integration: Company Enrichment Service
 * 
 * This service uses a keyless public API (microlink.io) to fetch details about a company
 * based on a lead's email address.
 * 
 * Workflow:
 * 1. Extract the domain name from the lead's email (e.g., "jane@stripe.com" -> "stripe.com").
 * 2. Check if it's a personal email provider (like gmail.com, yahoo.com). If so, skip enrichment.
 * 3. Make a request to: https://api.microlink.io/?url=https://<domain>
 * 4. Parse the title, description, and logo image, then return them.
 * 5. Handles failures gracefully so that the lead is still created even if the external API is offline.
 */

const personalEmailProviders = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'mail.com',
  'protonmail.com',
  'zoho.com'
]);

/**
 * Enriches a lead with company information using their email domain.
 * 
 * @param {string} email - The lead's email address
 * @returns {Promise<Object>} Object containing company_name, company_logo, and company_description (all null if enrichment fails or is skipped)
 */
async function enrichCompanyInfo(email) {
  const result = {
    company_name: null,
    company_logo: null,
    company_description: null
  };

  // Validate email
  if (!email || !email.includes('@')) {
    return result;
  }

  // 1. Extract the domain (e.g., name@company.com -> company.com)
  const parts = email.split('@');
  const domain = parts[parts.length - 1].toLowerCase().trim();

  // 2. Skip enrichment for personal emails (gmail.com, etc.)
  if (personalEmailProviders.has(domain)) {
    console.log(`Skipping enrichment for personal email domain: ${domain}`);
    return result;
  }

  try {
    console.log(`Attempting to enrich lead company info using domain: ${domain}...`);
    
    // We use Node's native fetch API (available in modern Node.js versions)
    const apiUrl = `https://api.microlink.io/?url=https://${domain}`;
    
    // Set a timeout of 4 seconds so that we don't freeze if the API takes too long
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    
    const response = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Microlink API returned status ${response.status}`);
    }

    const body = await response.json();

    if (body.status === 'success' && body.data) {
      const data = body.data;
      
      // Use publisher or title as company name
      result.company_name = data.publisher || data.title || domain.split('.')[0];
      
      // Use favicon/logo url
      result.company_logo = data.image ? data.image.url : (data.logo ? data.logo.url : null);
      
      // Use company description
      result.company_description = data.description || null;
      
      console.log(`Enrichment successful: Found company "${result.company_name}"`);
    } else {
      console.log(`Microlink did not return success for domain: ${domain}`);
    }
  } catch (error) {
    // If the enrichment API fails, log it but don't crash the application
    console.error(`Company enrichment failed for domain ${domain}:`, error.message);
  }

  return result;
}

module.exports = {
  enrichCompanyInfo
};
