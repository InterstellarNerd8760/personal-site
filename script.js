// Smooth reveal on scroll
const reveals = document.querySelectorAll('.reveal');

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      // Optional: unobserve after first reveal for performance
      // observer.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.15,
  rootMargin: '0px 0px -40px 0px'
});

reveals.forEach((el) => observer.observe(el));

// Optional: slight parallax or nav highlight could go here later
// Keep it lightweight for now

// Mobile nav could be added if needed, but simple is fine for this version
document.addEventListener('DOMContentLoaded', () => {
  // Any init
  console.log('Weston Rosch site loaded');
});