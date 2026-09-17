(function () {
  const translations = {
    en: {
      subtitle: 'Smart Legal Metrology Compliance',
      headline: 'Scan. Understand. Validate. Verify.',
      message: 'LabelIQ helps teams turn package images into readable declarations, evidence, and verification-ready compliance decisions.',
      benefit_ocr: 'OCR extraction',
      benefit_ocr_copy: 'Read package declarations from uploaded images.',
      benefit_rules: 'Rule context',
      benefit_rules_copy: 'Review checks with Legal Metrology source context.',
      benefit_verify: 'Officer ready',
      benefit_verify_copy: 'Keep results ready for verification and reports.',
      signin_title: 'Sign in to your portal',
      signup_title: 'Create your account',
      signup_message: 'Start with the right portal. Business details can be completed after signup.',
      portal: 'Portal',
      public: 'Public',
      business: 'Business',
      officer: 'Officer',
      continue_google: 'Continue with Google',
      or_password: 'or use password',
      or_email: 'or use email',
      email_username: 'Email / Username',
      full_name: 'Full Name',
      email: 'Email',
      phone: 'Phone',
      password: 'Password',
      confirm_password: 'Confirm Password',
      forgot_password: 'Forgot Password',
      sign_in: 'Sign In',
      create_account: 'Create Account',
      continue_demo: 'Continue as Demo',
      no_account: "Don't have an account?",
      have_account: 'Already have an account?',
      use_demo_credentials: 'Use demo credentials',
      officer_auth_required: 'Officer registration requires authorization. Please contact the administrator for access.',
      business_after_signup: 'Business profile details can be completed after account creation.'
    },
    hi: {
      headline: 'स्कैन करें. समझें. मान्य करें. सत्यापित करें.',
      signin_title: 'अपने पोर्टल में साइन इन करें',
      signup_title: 'अपना खाता बनाएं',
      sign_in: 'साइन इन',
      create_account: 'खाता बनाएं',
      continue_demo: 'डेमो जारी रखें',
      email_username: 'ईमेल / उपयोगकर्ता नाम',
      password: 'पासवर्ड'
    },
    ml: {
      headline: 'സ്കാൻ ചെയ്യുക. മനസ്സിലാക്കുക. സാധൂകരിക്കുക. സ്ഥിരീകരിക്കുക.',
      signin_title: 'നിങ്ങളുടെ പോർട്ടലിലേക്ക് സൈൻ ഇൻ ചെയ്യുക',
      signup_title: 'അക്കൗണ്ട് സൃഷ്ടിക്കുക',
      sign_in: 'സൈൻ ഇൻ',
      create_account: 'അക്കൗണ്ട് സൃഷ്ടിക്കുക',
      continue_demo: 'ഡെമോ തുടരുക',
      email_username: 'ഇമെയിൽ / ഉപയോക്തൃനാമം',
      password: 'പാസ്‌വേഡ്'
    },
    ta: {
      headline: 'ஸ்கேன். புரிந்து கொள்ளுங்கள். மதிப்பிடுங்கள். சரிபார்க்கவும்.',
      signin_title: 'உங்கள் போர்டலில் உள்நுழைக',
      signup_title: 'உங்கள் கணக்கை உருவாக்கவும்',
      sign_in: 'உள்நுழை',
      create_account: 'கணக்கு உருவாக்கு'
    }
  };

  function apply(language) {
    const pack = { ...translations.en, ...(translations[language] || {}) };
    document.querySelectorAll('[data-auth-text]').forEach((node) => {
      const value = pack[node.dataset.authText];
      if (value) node.textContent = value;
    });
  }

  function setupLoadingStates() {
    document.querySelectorAll('[data-auth-form]').forEach((form) => {
      form.addEventListener('submit', () => {
        const button = form.querySelector('[data-auth-submit]');
        if (!button) return;
        button.dataset.originalText = button.textContent;
        button.textContent = 'Loading...';
        button.disabled = true;
      });
    });
  }

  function setupOrbs() {
    if (!window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.utils.toArray('[data-auth-orb]').forEach((orb, index) => {
      gsap.to(orb, {
        x: index % 2 ? -36 : 42,
        y: index % 2 ? 46 : -38,
        duration: 10 + index * 4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });
    });
  }

  window.addEventListener('labeliq:languagechange', (event) => apply(event.detail.language));
  document.addEventListener('DOMContentLoaded', () => {
    apply(window.LabelIQI18n?.selectedLanguage?.() || 'en');
    setupLoadingStates();
    setupOrbs();
  });
})();
