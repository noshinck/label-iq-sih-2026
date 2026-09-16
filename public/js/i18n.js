(function () {
  const storageKey = 'labeliq.language';
  const fallbackLocale = 'en';
  let dictionary = {};

  const whyTranslations = {
    hi: {
      'Detected in OCR text with image evidence and matched to ingested legal source context.': 'यह घोषणा OCR पाठ में छवि साक्ष्य के साथ मिली और कानूनी स्रोत संदर्भ से मेल खाती है।',
      'Detected by extraction but OCR evidence line could not be matched exactly.': 'AI extraction में घोषणा मिली, लेकिन OCR साक्ष्य पंक्ति से सटीक मिलान नहीं हो सका।',
      'The declaration was not found in the combined OCR text from uploaded product images.': 'अपलोड की गई उत्पाद छवियों के संयुक्त OCR पाठ में यह घोषणा नहीं मिली।',
      'OCR confidence is used as a screening signal. Physical letter size and contrast still require officer verification from the package or calibrated image.': 'OCR confidence को स्क्रीनिंग संकेत के रूप में उपयोग किया गया है। वास्तविक अक्षर आकार और contrast के लिए अधिकारी सत्यापन आवश्यक है।',
      'Source support unavailable - officer verification required.': 'स्रोत समर्थन उपलब्ध नहीं है - अधिकारी सत्यापन आवश्यक है।'
    },
    ml: {
      'Detected in OCR text with image evidence and matched to ingested legal source context.': 'ചിത്ര തെളിവോടുകൂടി OCR ടെക്സ്റ്റിൽ ഈ പ്രഖ്യാപനം കണ്ടെത്തി, നിയമ സോഴ്സ് കോൺടെക്സ്റ്റുമായി പൊരുത്തപ്പെട്ടു.',
      'Detected by extraction but OCR evidence line could not be matched exactly.': 'AI extraction പ്രഖ്യാപനം കണ്ടെത്തി, പക്ഷേ OCR തെളിവ് വരിയുമായി കൃത്യമായി പൊരുത്തപ്പെടുത്താൻ കഴിഞ്ഞില്ല.',
      'The declaration was not found in the combined OCR text from uploaded product images.': 'അപ്‌ലോഡ് ചെയ്ത ഉൽപ്പന്ന ചിത്രങ്ങളുടെ സംയോജിത OCR ടെക്സ്റ്റിൽ ഈ പ്രഖ്യാപനം കണ്ടെത്തിയില്ല.',
      'OCR confidence is used as a screening signal. Physical letter size and contrast still require officer verification from the package or calibrated image.': 'OCR confidence ഒരു screening signal ആയി ഉപയോഗിക്കുന്നു. യഥാർത്ഥ അക്ഷര വലുപ്പവും contrast ഉം ഓഫീസർ സ്ഥിരീകരണം ആവശ്യമാണ്.',
      'Source support unavailable - officer verification required.': 'സോഴ്സ് പിന്തുണ ലഭ്യമല്ല - ഓഫീസർ സ്ഥിരീകരണം ആവശ്യമാണ്.'
    }
  };

  const genericWhyPrefix = {
    hi: 'स्पष्टीकरण',
    ml: 'വിശദീകരണം',
    ta: 'விளக்கம்',
    kn: 'ವಿವರಣೆ',
    te: 'వివరణ',
    mr: 'स्पष्टीकरण',
    bn: 'ব্যাখ্যা',
    gu: 'સ્પષ્ટીકરણ',
    pa: 'ਵਿਆਖਿਆ',
    or: 'ବ୍ୟାଖ୍ୟା',
    as: 'ব্যাখ্যা'
  };

  function selectedLanguage() {
    return localStorage.getItem(storageKey) || fallbackLocale;
  }

  function translate(key) {
    return dictionary[key] || key;
  }

  function translateStatus(value) {
    const normalized = String(value || '').trim().toLowerCase().replaceAll(' ', '_').replaceAll('-', '_');
    return dictionary[`status.${normalized}`] || value;
  }

  function translateWhy(text, language) {
    const original = String(text || '').trim();
    if (!original || language === 'en') return original;
    if (whyTranslations[language] && whyTranslations[language][original]) return whyTranslations[language][original];
    return `${genericWhyPrefix[language] || 'Explanation'}: ${original}`;
  }

  async function loadDictionary(language) {
    const response = await fetch(`/api/i18n/${encodeURIComponent(language)}`);
    dictionary = response.ok ? await response.json() : {};
  }

  function applyTranslations(language) {
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = translate(node.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      node.setAttribute('placeholder', translate(node.dataset.i18nPlaceholder));
    });
    document.querySelectorAll('[data-i18n-status]').forEach((node) => {
      node.textContent = translateStatus(node.dataset.i18nStatus);
    });
    document.querySelectorAll('[data-translate-why]').forEach((node) => {
      node.textContent = translateWhy(node.dataset.originalWhy, language);
    });
    document.querySelectorAll('[data-language-select]').forEach((select) => {
      select.value = language;
    });
    window.dispatchEvent(new CustomEvent('labeliq:languagechange', { detail: { language } }));
  }

  async function setLanguage(language) {
    localStorage.setItem(storageKey, language);
    await loadDictionary(language);
    applyTranslations(language);
    fetch('/api/i18n/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language })
    }).catch(() => {});
  }

  document.addEventListener('change', (event) => {
    if (!event.target.matches('[data-language-select]')) return;
    setLanguage(event.target.value);
  });

  document.addEventListener('DOMContentLoaded', () => {
    setLanguage(selectedLanguage());
  });

  window.LabelIQI18n = {
    setLanguage,
    selectedLanguage,
    translate
  };
})();
