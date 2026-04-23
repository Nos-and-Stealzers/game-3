// Mini Arcade - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the website
    initializeAnimations();
    initializeNavigation();
    initializeGameCards();
    initializeMobileOptimizations();
    
    console.log('🎮 Mini Arcade loaded successfully!');
});

// Animation system
function initializeAnimations() {
    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    // Observe game cards
    document.querySelectorAll('.game-card').forEach(card => {
        observer.observe(card);
    });
    
    // Observe sections
    document.querySelectorAll('.section-title').forEach(title => {
        observer.observe(title);
    });
}

// Navigation functionality
function initializeNavigation() {
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            
            // Skip empty anchors (just "#")
            if (href === '#') {
                e.preventDefault();
                return;
            }
            
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Header scroll effect
    let lastScrollY = window.scrollY;
    const header = document.querySelector('.header');
    
    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        
        if (currentScrollY > 100) {
            header.style.background = 'rgba(79, 70, 229, 0.95)';
            header.style.backdropFilter = 'blur(20px)';
        } else {
            header.style.background = 'linear-gradient(180deg, rgba(255,255,255,.25), rgba(255,255,255,.05))';
            header.style.backdropFilter = 'blur(10px)';
        }
        
        lastScrollY = currentScrollY;
    });
}

// Game card interactions
function initializeGameCards() {
    document.querySelectorAll('.game-card').forEach(card => {
        // Add ripple effect on click
        card.addEventListener('click', function(e) {
            if (this.classList.contains('coming-soon')) {
                e.preventDefault();
                showComingSoonMessage();
                return;
            }
            
            // Create ripple effect
            const ripple = document.createElement('div');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s ease-out;
                pointer-events: none;
                z-index: 1000;
            `;
            
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            
            // Remove ripple after animation
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
        
        // Add hover sound effect (optional)
        card.addEventListener('mouseenter', function() {
            if (!this.classList.contains('coming-soon')) {
                // Add subtle scale animation
                this.style.transform = 'translateY(-8px) scale(1.02)';
            }
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = '';
        });
    });
}

// Show coming soon message
function showComingSoonMessage() {
    // Create and show a temporary notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        font-weight: 600;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    notification.textContent = '🚀 Coming Soon! Stay tuned for more awesome games!';
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Animate out and remove
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Game data management
const games = {
    'rainbow-bottles': {
        title: 'Rainbow Bottles',
        description: 'Sort colorful objects by type in this addictive 3D puzzle game. Pour objects between bottles to create matching sets!',
        tags: ['Puzzle', '3D', 'Strategy'],
        url: './games/3d-rainbow-bottles.html',
        available: true
    }
};

// Add CSS for ripple animation
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(2);
            opacity: 0;
        }
    }
    
    .game-card {
        transition: all 0.3s ease;
    }
    
    .notification-enter {
        animation: slideInRight 0.3s ease;
    }
    
    .notification-exit {
        animation: slideOutRight 0.3s ease;
    }
    
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
        }
        to {
            transform: translateX(0);
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
        }
        to {
            transform: translateX(100%);
        }
    }
`;
document.head.appendChild(style);

// Performance optimization
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Optimized scroll handler
const optimizedScrollHandler = debounce(() => {
    // Additional scroll handling can go here
}, 16); // ~60fps

window.addEventListener('scroll', optimizedScrollHandler);

// Preload critical resources
function preloadResources() {
    // Preload game thumbnails and critical assets
    const imagesToPreload = [
        './images/background.jpg',
        './images/og-image.svg'
    ];
    
    imagesToPreload.forEach(src => {
        const img = new Image();
        img.src = src;
    });
}

// Initialize preloading
preloadResources();

// Mobile-specific optimizations
function initializeMobileOptimizations() {
    // Detect mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (isMobile || isTouch) {
        document.body.classList.add('mobile-device');
        
        // Optimize viewport for mobile
        optimizeViewport();
        
        // Add touch-specific event listeners
        addTouchEventListeners();
        
        // Optimize scroll performance
        optimizeScrolling();
        
        // Add mobile-specific navigation behavior
        optimizeMobileNavigation();
        
        console.log('📱 Mobile optimizations activated');
    }
    
    // Handle orientation changes
    window.addEventListener('orientationchange', handleOrientationChange);
    
    // Handle resize events (debounced)
    window.addEventListener('resize', debounce(handleResize, 250));
}

// Optimize viewport for mobile devices
function optimizeViewport() {
    // Ensure viewport meta tag is properly set
    let viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
        viewport.setAttribute('content', 
            'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
        );
    }
    
    // Prevent zoom on double tap
    document.addEventListener('dblclick', function(e) {
        e.preventDefault();
    }, { passive: false });
}

// Add touch-specific event listeners
function addTouchEventListeners() {
    // Better touch feedback for game cards
    document.querySelectorAll('.game-card').forEach(card => {
        let touchStartTime;
        
        card.addEventListener('touchstart', function(e) {
            touchStartTime = Date.now();
            this.classList.add('touching');
            
            // Add visual feedback
            this.style.transform = 'scale(0.98)';
            this.style.transition = 'transform 0.1s ease';
        }, { passive: true });
        
        card.addEventListener('touchend', function(e) {
            this.classList.remove('touching');
            this.style.transform = '';
            
            // Handle tap (not swipe)
            const touchDuration = Date.now() - touchStartTime;
            if (touchDuration < 500) {
                // Short tap - proceed with navigation
                if (!this.classList.contains('coming-soon')) {
                    // Add haptic feedback if available
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                }
            }
        }, { passive: true });
        
        card.addEventListener('touchcancel', function(e) {
            this.classList.remove('touching');
            this.style.transform = '';
        }, { passive: true });
    });
    
    // Touch feedback for buttons
    document.querySelectorAll('.btn, .play-button, .hero-cta').forEach(button => {
        button.addEventListener('touchstart', function(e) {
            this.style.transform = 'scale(0.95)';
            
            // Haptic feedback
            if (navigator.vibrate) {
                navigator.vibrate(30);
            }
        }, { passive: true });
        
        button.addEventListener('touchend', function(e) {
            this.style.transform = '';
        }, { passive: true });
    });
}

// Optimize scrolling performance
function optimizeScrolling() {
    // Use passive listeners for better scroll performance
    let ticking = false;
    
    function updateScrollElements() {
        // Update elements that change on scroll
        const header = document.querySelector('.header');
        const scrollY = window.scrollY;
        
        if (scrollY > 50) {
            header.style.background = 'rgba(79, 70, 229, 0.95)';
            header.style.backdropFilter = 'blur(20px)';
        } else {
            header.style.background = 'linear-gradient(180deg, rgba(255,255,255,.25), rgba(255,255,255,.05))';
            header.style.backdropFilter = 'blur(10px)';
        }
        
        ticking = false;
    }
    
    function requestScrollUpdate() {
        if (!ticking) {
            requestAnimationFrame(updateScrollElements);
            ticking = true;
        }
    }
    
    window.addEventListener('scroll', requestScrollUpdate, { passive: true });
}

// Optimize mobile navigation
function optimizeMobileNavigation() {
    const nav = document.querySelector('.nav');
    const navLinks = document.querySelectorAll('.nav-link');
    
    // Add mobile menu behavior if needed
    if (window.innerWidth <= 575) {
        // Make navigation sticky and more prominent
        nav.style.position = 'sticky';
        nav.style.top = '0';
        nav.style.zIndex = '1000';
        
        // Add smooth scroll to nav links
        navLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href.startsWith('#')) {
                    e.preventDefault();
                    const target = document.querySelector(href);
                    if (target) {
                        target.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                        
                        // Add visual feedback
                        this.style.background = 'rgba(255,255,255,0.2)';
                        setTimeout(() => {
                            this.style.background = '';
                        }, 300);
                    }
                }
            });
        });
    }
}

// Handle orientation changes
function handleOrientationChange() {
    // Wait for orientation change to complete
    setTimeout(() => {
        // Recalculate layouts if needed
        window.dispatchEvent(new Event('resize'));
        
        // Adjust hero section height
        const hero = document.querySelector('.hero');
        if (hero && window.innerWidth <= 768) {
            if (window.orientation === 90 || window.orientation === -90) {
                // Landscape
                hero.style.minHeight = '40vh';
            } else {
                // Portrait
                hero.style.minHeight = '50vh';
            }
        }
    }, 500);
}

// Handle window resize
function handleResize() {
    const width = window.innerWidth;
    
    // Adjust navigation for different screen sizes
    const nav = document.querySelector('.nav');
    if (width <= 575) {
        nav.classList.add('mobile-nav');
    } else {
        nav.classList.remove('mobile-nav');
    }
    
    // Adjust game grid layout
    const gamesGrid = document.querySelector('.games-grid');
    if (gamesGrid) {
        if (width <= 575) {
            gamesGrid.style.gridTemplateColumns = '1fr';
        } else if (width <= 768) {
            gamesGrid.style.gridTemplateColumns = '1fr';
        } else if (width <= 992) {
            gamesGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        } else {
            gamesGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(350px, 1fr))';
        }
    }
}

// Enhanced debounce function with immediate option
function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func(...args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func(...args);
    };
}

// Add mobile-specific styles dynamically
function addMobileStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .mobile-device .game-card {
            -webkit-tap-highlight-color: transparent;
            user-select: none;
        }
        
        .mobile-device .touching {
            opacity: 0.8;
        }
        
        .mobile-nav {
            position: sticky !important;
            top: 0 !important;
            background: rgba(79, 70, 229, 0.95) !important;
            backdrop-filter: blur(20px) !important;
        }
        
        @supports (padding: max(0px)) {
            .mobile-device .nav {
                padding-left: max(1rem, env(safe-area-inset-left));
                padding-right: max(1rem, env(safe-area-inset-right));
            }
        }
    `;
    document.head.appendChild(style);
}

// Initialize mobile styles
addMobileStyles();

// Export for use in other scripts if needed
window.MiniArcade = {
    games,
    showComingSoonMessage,
    initializeAnimations,
    initializeNavigation,
    initializeGameCards,
    initializeMobileOptimizations
};
