
const auditButton = document.querySelector('#audit-button');
const pageUrlInput = document.querySelector('#page-url');
const status = document.querySelector('#status');
const resultsSection = document.querySelector('#results');

const passedCount = document.querySelector('#passed-count');
const warningCount = document.querySelector('#warning-count');
const errorCount = document.querySelector('#error-count');

const pageDetails = document.querySelector('#page-details');
const auditResults = document.querySelector('#audit-results');

function addResult(results, name, outcome, message) {
  results.push({ name, outcome, message });
}

function getMetaContent(doc, selector) {
  return doc.querySelector(selector)?.getAttribute('content')?.trim() || '';
}

function validatePageUrl(value) {
  try {
    const url = new URL(value);

    if (!['https:', 'http:'].includes(url.protocol)) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function auditMetadata(doc, url) {
  const checks = [];

  const title = doc.querySelector('title')?.textContent.trim() || '';
  const description = getMetaContent(
    doc,
    'meta[name="description"]',
  );

  const canonical = doc.querySelector('link[rel="canonical"]')
    ?.getAttribute('href')?.trim() || '';

  const robots = getMetaContent(doc, 'meta[name="robots"]');

  const ogTitle = getMetaContent(doc, 'meta[property="og:title"]');
  const ogDescription = getMetaContent(
    doc,
    'meta[property="og:description"]',
  );
  const ogImage = getMetaContent(doc, 'meta[property="og:image"]');
  const ogUrl = getMetaContent(doc, 'meta[property="og:url"]');

  const h1Elements = [...doc.querySelectorAll('h1')];
  const h1Text = h1Elements
    .map((heading) => heading.textContent.trim())
    .filter(Boolean);

  // Page title
  if (!title) {
    addResult(checks, 'Page title', 'error', 'Title is missing or empty.');
  } else if (title.length > 60) {
    addResult(
      checks,
      'Page title',
      'warning',
      `Title is ${title.length} characters. Review whether it can be more concise.`,
    );
  } else {
    addResult(
      checks,
      'Page title',
      'passed',
      `Title found (${title.length} characters): ${title}`,
    );
  }

  // Meta description
  if (!description) {
    addResult(
      checks,
      'Meta description',
      'error',
      'Meta description is missing or empty.',
    );
  } else if (description.length > 160) {
    addResult(
      checks,
      'Meta description',
      'warning',
      `Description is ${description.length} characters. Review its length.`,
    );
  } else {
    addResult(
      checks,
      'Meta description',
      'passed',
      `Description found (${description.length} characters).`,
    );
  }

  // Canonical URL
  if (!canonical) {
    addResult(
      checks,
      'Canonical URL',
      'warning',
      'No canonical URL was found.',
    );
  } else {
    try {
      const canonicalUrl = new URL(canonical, url);

      if (!['http:', 'https:'].includes(canonicalUrl.protocol)) {
        throw new Error('Invalid protocol');
      }

      addResult(
        checks,
        'Canonical URL',
        'passed',
        `Canonical URL found: ${canonicalUrl.href}`,
      );
    } catch {
      addResult(
        checks,
        'Canonical URL',
        'error',
        'Canonical URL is invalid.',
      );
    }
  }

  // Robots directives
  if (robots.toLowerCase().includes('noindex')) {
    addResult(
      checks,
      'Robots directives',
      'warning',
      'The page contains a noindex directive. Confirm that this is intentional.',
    );
  } else {
    addResult(
      checks,
      'Robots directives',
      'passed',
      robots
        ? `Robots directive found: ${robots}`
        : 'No page-level robots directive found.',
    );
  }

  // Open Graph
  [
    ['Open Graph title', ogTitle],
    ['Open Graph description', ogDescription],
    ['Open Graph image', ogImage],
    ['Open Graph URL', ogUrl],
  ].forEach(([name, value]) => {
    addResult(
      checks,
      name,
      value ? 'passed' : 'warning',
      value ? 'Metadata found.' : `${name} is missing or empty.`,
    );
  });

  // H1 headings
  if (h1Text.length === 0) {
    addResult(checks, 'H1 heading', 'warning', 'No non-empty H1 heading found.');
  } else if (h1Text.length > 1) {
    addResult(
      checks,
      'H1 heading',
      'warning',
      `Found ${h1Text.length} non-empty H1 headings. Review the page structure.`,
    );
  } else {
    addResult(checks, 'H1 heading', 'passed', `H1 found: ${h1Text[0]}`);
  }

  return {
    checks,
    details: {
      title: title || 'Missing',
      description: description || 'Missing',
      canonical: canonical || 'Missing',
      pageUrl: url.href,
    },
  };
}

function renderResults(audit) {
  const { checks, details } = audit;

  passedCount.textContent = checks.filter(
    (check) => check.outcome === 'passed',
  ).length;

  warningCount.textContent = checks.filter(
    (check) => check.outcome === 'warning',
  ).length;

  errorCount.textContent = checks.filter(
    (check) => check.outcome === 'error',
  ).length;

  pageDetails.replaceChildren();

  const detailsHeading = document.createElement('h3');
  detailsHeading.textContent = 'Page details';
  pageDetails.append(detailsHeading);

  Object.entries(details).forEach(([key, value]) => {
    const paragraph = document.createElement('p');
    const label = document.createElement('strong');

    label.textContent = `${key}: `;
    paragraph.append(label, document.createTextNode(value));
    pageDetails.append(paragraph);
  });

  auditResults.replaceChildren();

  checks.forEach((check) => {
    const card = document.createElement('article');
    card.className = 'audit-result';

    const heading = document.createElement('h3');
    heading.textContent = `${check.outcome.toUpperCase()} — ${check.name}`;

    const message = document.createElement('p');
    message.textContent = check.message;

    card.append(heading, message);
    auditResults.append(card);
  });

  resultsSection.hidden = false;
}

auditButton.addEventListener('click', async () => {
  const url = validatePageUrl(pageUrlInput.value.trim());

  if (!url) {
    status.textContent = 'Enter a valid HTTP or HTTPS page URL.';
    resultsSection.hidden = true;
    return;
  }

  auditButton.disabled = true;
  resultsSection.hidden = true;
  status.textContent = 'Fetching page and auditing metadata...';

  try {
    const response = await fetch(url.href, {
      headers: { Accept: 'text/html' },
    });

    if (!response.ok) {
      throw new Error(`The page returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('text/html')) {
      throw new Error('The URL did not return an HTML page.');
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const audit = auditMetadata(doc, url);
    renderResults(audit);

    status.textContent = 'Audit completed.';
  } catch (error) {
    status.textContent = error instanceof TypeError
      ? 'Could not fetch the page. Check the URL and cross-origin access (CORS).'
      : `Audit failed: ${error.message}`;
  } finally {
    auditButton.disabled = false;
  }
});
