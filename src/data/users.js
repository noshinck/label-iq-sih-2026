const users = [
  { username: 'admin', password: 'admin123', role: 'consumer' },
  { username: 'business_user', password: 'admin123', role: 'business' },
  { username: 'inspector', password: 'admin123', role: 'legal' }
];

function findUser(username, password) {
  return users.find((user) => user.username === username && user.password === password);
}

function usernameExists(username) {
  return users.some((user) => user.username === username);
}

function addUser(user) {
  users.push(user);
  return user;
}

module.exports = {
  users,
  findUser,
  usernameExists,
  addUser
};
