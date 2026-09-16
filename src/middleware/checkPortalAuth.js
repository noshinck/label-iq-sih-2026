function checkPortalAuth(requiredRole) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.redirect(`/signin?portal=${requiredRole}`);
    }

    if (req.session.user.role !== requiredRole) {
      return res.status(403).render('unauthorized', {
        userRole: req.session.user.role,
        attemptedRole: requiredRole
      });
    }

    return next();
  };
}

module.exports = checkPortalAuth;
