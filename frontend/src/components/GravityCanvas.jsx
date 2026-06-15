import React, { useEffect, useRef } from 'react';

export default function GravityCanvas() {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: null, y: null, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let particles = [];
    let leaves = [];
    
    // Config parameters
    const PARTICLE_COUNT = 450;      
    const LEAF_COUNT = 22;           
    const REPEL_RADIUS = 145;        
    const LEAF_REPEL_RADIUS = 175;   
    const REPEL_POWER = 8.0;         
    const LEAF_REPEL_POWER = 12.0;   
    const RESTORE_FORCE = 0.035;     
    const DAMPING = 0.88;            
    const LEAF_DAMPING = 0.94;       
    const TRAIL_LENGTH = 4;          

    // Clean rgb colors for dynamic alpha injection
    const themeColors = [
      [176, 125, 78],  // Caramel
      [138, 90, 54],   // Coffee
      [190, 150, 110], // Warm Cream
    ];

    // Resize handler
    const handleResize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      initAssets();
    };

    // Initialize particles and falling leaves
    const initAssets = () => {
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = Math.random() * 2.2 + 0.8;
        const color = themeColors[i % themeColors.length];
        const alpha = Math.random() * 0.35 + 0.2;
        
        particles.push({
          x,
          y,
          homeX: x,
          homeY: y,
          vx: 0,
          vy: 0,
          radius,
          color,
          alpha,
          seed: Math.random() * 100,
          history: [],
        });
      }

      leaves = [];
      for (let i = 0; i < LEAF_COUNT; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const width = Math.random() * 8 + 8;    
        const height = width * (Math.random() * 0.4 + 1.4); 
        
        const rgb = themeColors[i % themeColors.length];
        const color = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.38)`;
        
        leaves.push({
          x,
          y,
          vx: 0,
          vy: 0,
          width,
          height,
          color,
          angle: Math.random() * Math.PI * 2,
          spinSpeed: Math.random() * 0.02 + 0.008,
          swaySpeed: Math.random() * 0.03 + 0.015,
          speedY: Math.random() * 0.6 + 0.4, 
          seed: Math.random() * 100,
        });
      }
    };

    // Track mouse position on the screen
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouse = mouseRef.current;
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    // Helper to draw the premium glassy moon
    const drawGlassyMoon = (ctx, x, y, r) => {
      ctx.save();

      // 1. Soft outer ambient atmospheric glow
      const glowGrad = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 2.2);
      glowGrad.addColorStop(0, 'rgba(176, 125, 78, 0.18)');
      glowGrad.addColorStop(0.4, 'rgba(212, 163, 115, 0.08)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // 2. Glass Base Circle (Semi-translucent frosted surface)
      const baseGrad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      baseGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      baseGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
      baseGrad.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = baseGrad;
      ctx.fill();

      // Fine frosted boundary stroke
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      // 3. Glowing Glassy Crescent Rim (Left/Top side reflective bezel)
      const rimGrad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
      rimGrad.addColorStop(0.3, 'rgba(176, 125, 78, 0.55)');
      rimGrad.addColorStop(0.7, 'rgba(212, 163, 115, 0.35)');
      rimGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.beginPath();
      ctx.arc(x, y, r - 0.5, -Math.PI * 0.7, Math.PI * 0.6);
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = 2.0;
      ctx.stroke();

      // 4. Glassy Specular Reflection (Top-left curved specular lens highlight)
      const specularGrad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x - r * 0.35, y - r * 0.35, r * 0.7);
      specularGrad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
      specularGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      ctx.beginPath();
      ctx.arc(x, y, r - 2, 0, Math.PI * 2);
      ctx.fillStyle = specularGrad;
      ctx.fill();

      // 5. Crescent shape shadow cutout (Creates the 3D spherical lens volume)
      ctx.beginPath();
      ctx.arc(x + r * 0.18, y + r * 0.18, r * 0.94, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(4, 8, 16, 0.32)';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.restore();
    };

    // Setup events
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    
    handleResize();

    // Main animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const time = Date.now() * 0.001;
      const mouse = mouseRef.current;

      // Draw Glassy Moon first so particles and leaves float in front of it
      const moonX = canvas.width - 160;
      const moonY = 140;
      const moonRadius = 65;
      drawGlassyMoon(ctx, moonX, moonY, moonRadius);

      // 1. Update & Draw Particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const swayX = Math.sin(time + p.seed * 5) * 0.15;
        const swayY = Math.cos(time + p.seed * 3) * 0.15;

        // Particle repulsion
        if (mouse.active && mouse.x !== null && mouse.y !== null) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < REPEL_RADIUS && dist > 1) {
            const force = (REPEL_RADIUS - dist) / REPEL_RADIUS;
            p.vx += (dx / dist) * force * REPEL_POWER;
            p.vy += (dy / dist) * force * REPEL_POWER;
          }
        }

        // Particle restoring spring
        p.vx += (p.homeX - p.x) * RESTORE_FORCE;
        p.vy += (p.homeY - p.y) * RESTORE_FORCE;
        p.vx *= DAMPING;
        p.vy *= DAMPING;
        
        p.x += p.vx + swayX;
        p.y += p.vy + swayY;

        // History trail collection
        p.history.push({ x: p.x, y: p.y });
        if (p.history.length > TRAIL_LENGTH) {
          p.history.shift();
        }

        // Draw particle trails
        for (let h = 0; h < p.history.length; h++) {
          const pos = p.history[h];
          const ratio = (h + 1) / p.history.length;
          const currentAlpha = p.alpha * ratio * 0.55;
          const currentRadius = p.radius * (0.5 + ratio * 0.5);

          ctx.beginPath();
          ctx.arc(pos.x, pos.y, currentRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${currentAlpha})`;
          ctx.fill();

          if (h === p.history.length - 1) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, currentRadius * 2.2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${currentAlpha * 0.25})`;
            ctx.fill();
          }
        }
      }

      // 2. Update & Draw Falling Leaves
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        const sway = Math.sin(time * leaf.swaySpeed + leaf.seed) * 0.35;

        // Leaf wind repulsion
        if (mouse.active && mouse.x !== null && mouse.y !== null) {
          const dx = leaf.x - mouse.x;
          const dy = leaf.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < LEAF_REPEL_RADIUS && dist > 1) {
            const force = (LEAF_REPEL_RADIUS - dist) / LEAF_REPEL_RADIUS;
            leaf.vx += (dx / dist) * force * LEAF_REPEL_POWER;
            leaf.vy += (dy / dist) * force * LEAF_REPEL_POWER;
            leaf.angle += (dx > 0 ? 0.08 : -0.08) * force;
          }
        }

        // Apply leaf velocities
        leaf.vx *= LEAF_DAMPING;
        leaf.vy *= LEAF_DAMPING;

        leaf.x += leaf.vx + sway;
        leaf.y += leaf.vy + leaf.speedY;
        leaf.angle += leaf.spinSpeed;

        // Wrap boundaries
        if (leaf.y > canvas.height + 20) {
          leaf.y = -20;
          leaf.x = Math.random() * canvas.width;
          leaf.vx = 0;
          leaf.vy = 0;
        }
        if (leaf.x < -20) {
          leaf.x = canvas.width + 20;
        } else if (leaf.x > canvas.width + 20) {
          leaf.x = -20;
        }

        // Draw Leaf Shape with rotation
        ctx.save();
        ctx.translate(leaf.x, leaf.y);
        ctx.rotate(leaf.angle);
        
        ctx.beginPath();
        ctx.moveTo(0, -leaf.height / 2);
        ctx.quadraticCurveTo(leaf.width / 2, 0, 0, leaf.height / 2);
        ctx.quadraticCurveTo(-leaf.width / 2, 0, 0, -leaf.height / 2);
        ctx.fillStyle = leaf.color;
        ctx.fill();

        // Leaf spine vein line
        ctx.beginPath();
        ctx.moveTo(0, -leaf.height / 2);
        ctx.lineTo(0, leaf.height / 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup listeners
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="gravity-canvas" 
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
}
