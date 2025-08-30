const SEO = require('../models/SEO');

/**
 * Get SEO data for a specific page path
 * @param {string} pagePath - The page path to get SEO data for
 * @returns {Object|null} SEO data object or null if not found
 */
const getSEOForPage = async (pagePath) => {
  try {
    const seoData = await SEO.getByPagePath(pagePath);
    return seoData;
  } catch (error) {
    console.error('Error getting SEO data for page:', pagePath, error);
    return null;
  }
};

/**
 * Generate meta tags HTML for a page
 * @param {Object} seoData - SEO data object
 * @returns {string} HTML string with meta tags
 */
const generateMetaTags = (seoData) => {
  if (!seoData) return '';

  let metaTags = '';

  // Basic meta tags
  if (seoData.metaTitle) {
    metaTags += `<title>${seoData.metaTitle}</title>\n`;
  }
  
  if (seoData.metaDescription) {
    metaTags += `<meta name="description" content="${seoData.metaDescription}">\n`;
  }
  
  if (seoData.keywords && seoData.keywords.length > 0) {
    metaTags += `<meta name="keywords" content="${seoData.keywords.join(', ')}">\n`;
  }
  
  if (seoData.canonicalUrl) {
    metaTags += `<link rel="canonical" href="${seoData.canonicalUrl}">\n`;
  }

  // Robots meta tag
  if (seoData.robots) {
    metaTags += `<meta name="robots" content="${seoData.robots}">\n`;
  }

  // Open Graph tags
  if (seoData.ogTitle) {
    metaTags += `<meta property="og:title" content="${seoData.ogTitle}">\n`;
  }
  
  if (seoData.ogDescription) {
    metaTags += `<meta property="og:description" content="${seoData.ogDescription}">\n`;
  }
  
  if (seoData.ogImage) {
    metaTags += `<meta property="og:image" content="${seoData.ogImage}">\n`;
  }
  
  if (seoData.ogType) {
    metaTags += `<meta property="og:type" content="${seoData.ogType}">\n`;
  }
  
  if (seoData.ogUrl) {
    metaTags += `<meta property="og:url" content="${seoData.ogUrl}">\n`;
  }

  // Twitter Card tags
  if (seoData.twitterCard) {
    metaTags += `<meta name="twitter:card" content="${seoData.twitterCard}">\n`;
  }
  
  if (seoData.twitterTitle) {
    metaTags += `<meta name="twitter:title" content="${seoData.twitterTitle}">\n`;
  }
  
  if (seoData.twitterDescription) {
    metaTags += `<meta name="twitter:description" content="${seoData.twitterDescription}">\n`;
  }
  
  if (seoData.twitterImage) {
    metaTags += `<meta name="twitter:image" content="${seoData.twitterImage}">\n`;
  }
  
  if (seoData.twitterSite) {
    metaTags += `<meta name="twitter:site" content="${seoData.twitterSite}">\n`;
  }
  
  if (seoData.twitterCreator) {
    metaTags += `<meta name="twitter:creator" content="${seoData.twitterCreator}">\n`;
  }

  // Additional meta tags
  if (seoData.additionalMetaTags && seoData.additionalMetaTags.length > 0) {
    seoData.additionalMetaTags.forEach(tag => {
      metaTags += `<meta name="${tag.name}" content="${tag.content}">\n`;
    });
  }

  return metaTags;
};

/**
 * Generate structured data JSON-LD
 * @param {Object} seoData - SEO data object
 * @returns {string} JSON-LD script tag
 */
const generateStructuredData = (seoData) => {
  if (!seoData || !seoData.structuredData || Object.keys(seoData.structuredData).length === 0) {
    return '';
  }

  return `<script type="application/ld+json">${JSON.stringify(seoData.structuredData)}</script>`;
};

/**
 * Generate preload/prefetch resource tags
 * @param {Object} seoData - SEO data object
 * @returns {string} HTML string with resource tags
 */
const generateResourceTags = (seoData) => {
  if (!seoData) return '';

  let resourceTags = '';

  // Preload resources
  if (seoData.preloadResources && seoData.preloadResources.length > 0) {
    seoData.preloadResources.forEach(resource => {
      const extension = resource.split('.').pop().toLowerCase();
      const as = extension === 'css' ? 'style' : 
                 extension === 'js' ? 'script' : 
                 extension === 'woff' || extension === 'woff2' ? 'font' : 'image';
      
      resourceTags += `<link rel="preload" href="${resource}" as="${as}">\n`;
    });
  }

  // Prefetch resources
  if (seoData.prefetchResources && seoData.prefetchResources.length > 0) {
    seoData.prefetchResources.forEach(resource => {
      resourceTags += `<link rel="prefetch" href="${resource}">\n`;
    });
  }

  return resourceTags;
};

/**
 * Generate analytics tracking codes
 * @param {Object} seoData - SEO data object
 * @returns {string} HTML string with tracking codes
 */
const generateAnalyticsCodes = (seoData) => {
  if (!seoData) return '';

  let analyticsCodes = '';

  // Google Analytics
  if (seoData.googleAnalyticsId) {
    analyticsCodes += `
    <!-- Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${seoData.googleAnalyticsId}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${seoData.googleAnalyticsId}');
    </script>
    `;
  }

  // Google Tag Manager
  if (seoData.googleTagManagerId) {
    analyticsCodes += `
    <!-- Google Tag Manager -->
    <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','${seoData.googleTagManagerId}');</script>
    <!-- End Google Tag Manager -->
    `;
  }

  // Facebook Pixel
  if (seoData.facebookPixelId) {
    analyticsCodes += `
    <!-- Facebook Pixel Code -->
    <script>
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${seoData.facebookPixelId}');
      fbq('track', 'PageView');
    </script>
    <noscript><img height="1" width="1" style="display:none"
      src="https://www.facebook.com/tr?id=${seoData.facebookPixelId}&ev=PageView&noscript=1"
    /></noscript>
    <!-- End Facebook Pixel Code -->
    `;
  }

  return analyticsCodes;
};

/**
 * Get complete SEO HTML for a page
 * @param {string} pagePath - The page path
 * @returns {Object} Object containing all SEO HTML components
 */
const getCompleteSEOForPage = async (pagePath) => {
  const seoData = await getSEOForPage(pagePath);
  
  if (!seoData) {
    return {
      metaTags: '',
      structuredData: '',
      resourceTags: '',
      analyticsCodes: '',
      seoData: null
    };
  }

  return {
    metaTags: generateMetaTags(seoData),
    structuredData: generateStructuredData(seoData),
    resourceTags: generateResourceTags(seoData),
    analyticsCodes: generateAnalyticsCodes(seoData),
    seoData: seoData
  };
};

/**
 * Get SEO data for multiple pages
 * @param {Array} pagePaths - Array of page paths
 * @returns {Object} Object with page paths as keys and SEO data as values
 */
const getSEOForMultiplePages = async (pagePaths) => {
  const seoDataMap = {};
  
  for (const pagePath of pagePaths) {
    seoDataMap[pagePath] = await getSEOForPage(pagePath);
  }
  
  return seoDataMap;
};

/**
 * Validate SEO data
 * @param {Object} seoData - SEO data object to validate
 * @returns {Object} Validation result with errors and warnings
 */
const validateSEOData = (seoData) => {
  const errors = [];
  const warnings = [];

  if (!seoData.metaTitle) {
    errors.push('Meta title is required');
  } else if (seoData.metaTitle.length > 60) {
    warnings.push('Meta title is longer than recommended (60 characters)');
  }

  if (!seoData.metaDescription) {
    errors.push('Meta description is required');
  } else if (seoData.metaDescription.length > 160) {
    warnings.push('Meta description is longer than recommended (160 characters)');
  }

  if (!seoData.h1Tag) {
    warnings.push('H1 tag is missing');
  }

  if (!seoData.ogTitle || !seoData.ogDescription || !seoData.ogImage) {
    warnings.push('Open Graph tags are incomplete');
  }

  if (!seoData.canonicalUrl) {
    warnings.push('Canonical URL is not set');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

module.exports = {
  getSEOForPage,
  generateMetaTags,
  generateStructuredData,
  generateResourceTags,
  generateAnalyticsCodes,
  getCompleteSEOForPage,
  getSEOForMultiplePages,
  validateSEOData
}; 