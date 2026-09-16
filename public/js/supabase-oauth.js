(function () {
  const portalStorageKey = 'labeliq.oauth.portal';
  const supabaseUrl = window.LABELIQ_SUPABASE_URL;
  const supabasePublishableKey = window.LABELIQ_SUPABASE_PUBLISHABLE_KEY;

  function portalPath(role) {
    if (role === 'business') return '/business';
    if (role === 'legal') return '/legal';
    return '/public';
  }

  function setMessage(button, type, message) {
    const container = button.parentElement;
    const status = container.querySelector('[data-google-status]');
    const error = container.querySelector('[data-google-error]');
    if (status) status.classList.toggle('hidden', type !== 'status');
    if (error) error.classList.toggle('hidden', type !== 'error');
    if (type === 'status' && status) status.textContent = message;
    if (type === 'error' && error) error.textContent = message;
  }

  function client() {
    if (!window.supabase) throw new Error('Supabase browser client failed to load.');
    if (!supabaseUrl || !supabasePublishableKey) throw new Error('Supabase OAuth is not configured.');
    return supabase.createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  async function syncServerSession(session, portal) {
    const response = await fetch('/auth/supabase/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        targetPortal: portal
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Portal access denied.');
    return payload;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('[data-google-oauth]');
    if (!buttons.length) return;

    let authClient;
    try {
      authClient = client();
    } catch (error) {
      buttons.forEach((button) => setMessage(button, 'error', error.message));
      return;
    }

    authClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') return;
      if (event !== 'SIGNED_IN' || !session) return;
      const portal = localStorage.getItem(portalStorageKey);
      if (!portal) return;
      try {
        const payload = await syncServerSession(session, portal);
        localStorage.removeItem(portalStorageKey);
        window.location.href = payload.redirectTo || portalPath(portal);
      } catch (error) {
        buttons.forEach((button) => setMessage(button, 'error', error.message));
      }
    });

    buttons.forEach((button) => {
      button.addEventListener('click', async () => {
        const portal = button.dataset.portal || 'consumer';
        const label = button.querySelector('[data-google-label]');
        button.disabled = true;
        if (label) label.textContent = 'Opening Google...';
        setMessage(button, 'status', 'Redirecting to Google sign-in...');

        try {
          localStorage.setItem(portalStorageKey, portal);
          const { error } = await authClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/auth/callback`
            }
          });
          if (error) throw error;
        } catch (error) {
          button.disabled = false;
          if (label) label.textContent = 'Continue with Google';
          setMessage(button, 'error', error.message);
        }
      });
    });
  });
})();
