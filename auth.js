// -------- Demo Auth (localStorage) --------
// users store
function getUsers(){ return JSON.parse(localStorage.getItem('mentapetUsers') || '[]'); }
function setUsers(u){ localStorage.setItem('mentapetUsers', JSON.stringify(u)); }
function saveUser(user){
  const users = getUsers();
  users.push(user);
  setUsers(users);
}

// session store
function getCurrentUser(){ return JSON.parse(localStorage.getItem('mentapet:currentUser') || 'null'); }
function setCurrentUser(user){ localStorage.setItem('mentapet:currentUser', JSON.stringify(user)); }
function clearCurrentUser(){ localStorage.removeItem('mentapet:currentUser'); }

function isAuthed(){ return !!getCurrentUser(); }

// Guards
function requireAuth(){
  console.warn('Authentication bypassed for testing purposes.');
}
function redirectIfAuthed(){
  if(isAuthed()){
    const pet = localStorage.getItem('mentapet:pet');
    window.location.href = pet ? 'room.html' : 'index.html';
  }
}

// Actions
function loginWithEmailPassword(email, password){
  const users = getUsers();
  const user = users.find(u => u.email === email && u.password === password);
  if(user){
    setCurrentUser({ name: user.name || user.email, email: user.email });
    return true;
  }
  return false;
}
function logout(){
  clearCurrentUser();
  window.location.href = 'login.html';
}
