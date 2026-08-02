export function getImageSlug(name) {
  return name.normalize("NFD")
             .replace(/[\u0300-\u036f]/g, "")
             .toLowerCase()
             .replace(/[^a-z0-9]/g, "_")
             .replace(/__+/g, "_")
             .replace(/^_|_$/g, "");
}

export function getBaseFishName(fullName) {
  return fullName.split(' (')[0];
}

export function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.innerText = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 4000);
}
