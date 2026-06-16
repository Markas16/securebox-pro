import React, { useEffect, useRef } from 'react';

export default function GravityCanvas() {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: null, y: null, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Fast 2d rendering context
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId;
    let particles = [];
    let leaves = [];
    let lastTime = performance.now();
    
    // Optimized particle/leaf configs for smooth performance
    const PARTICLE_COUNT = 380;      
    const LEAF_COUNT = 18;           
    const REPEL_RADIUS = 145;        
    const LEAF_REPEL_RADIUS = 175;   
    const REPEL_POWER = 8.0;         
    const LEAF_REPEL_POWER = 12.0;   
    const RESTORE_FORCE = 0.035;     
    const DAMPING = 0.88;            
    const LEAF_DAMPING = 0.94;       

    const themeColors = [
      [0, 242, 254],   // Cyan
      [56, 189, 248],  // Light Blue
      [192, 132, 252], // Purple
    ];

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
          seed: Math.random() * 100
        });
      }

      leaves = [];
      for (let i = 0; i < LEAF_COUNT; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const width = Math.random() * 8 + 8;    
        const height = width * (Math.random() * 0.4 + 1.4); 
        
        const rgb = themeColors[i % themeColors.length];
        const color = "rgba(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ", 0.38)";
        
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

    const drawGlassyMoon = (ctx, x, y, r) => {
      ctx.save();

      // Outer glow
      const glowGrad = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 2.2);
      glowGrad.addColorStop(0, 'rgba(0, 242, 254, 0.15)');
      glowGrad.addColorStop(0.4, 'rgba(192, 132, 252, 0.06)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // Glass base
      const baseGrad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      baseGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      baseGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
      baseGrad.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = baseGrad;
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      // Rim reflection
      const rimGrad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
      rimGrad.addColorStop(0.3, 'rgba(0, 242, 254, 0.45)');
      rimGrad.addColorStop(0.7, 'rgba(192, 132, 252, 0.25)');
      rimGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.beginPath();
      ctx.arc(x, y, r - 0.5, -Math.PI * 0.7, Math.PI * 0.6);
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = 2.0;
      ctx.stroke();

      // Specular highlight
      const specularGrad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x - r * 0.35, y - r * 0.35, r * 0.7);
      specularGrad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
      specularGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      ctx.beginPath();
      ctx.arc(x, y, r - 2, 0, Math.PI * 2);
      ctx.fillStyle = specularGrad;
      ctx.fill();

      // Inner shadow cutout
      ctx.beginPath();
      ctx.arc(x + r * 0.18, y + r * 0.18, r * 0.94, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(4, 8, 16, 0.32)';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.restore();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    
    handleResize();

    const animate = (now) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const time = now * 0.001;
      const mouse = mouseRef.current;

      // Frame rate delta normalization targeting 60fps baseline
      let dt = (now - lastTime) / 16.666;
      if (dt > 4) dt = 4; // Cap frame time jumps during tab swaps
      lastTime = now;

      const moonX = canvas.width - 160;
      const moonY = 140;
      const moonRadius = 65;
      drawGlassyMoon(ctx, moonX, moonY, moonRadius);

      // Create coordinate batch lists to reduce drawing overhead (6 path calls vs 1800+)
      const particlePaths = [
        { lines: [], dots: [] },
        { lines: [], dots: [] },
        { lines: [], dots: [] }
      ];

      // 1. Update Particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const colorIndex = i % themeColors.length;
        const swayX = Math.sin(time + p.seed * 5) * 0.15 * dt;
        const swayY = Math.cos(time + p.seed * 3) * 0.15 * dt;

        // Particle repulsion
        if (mouse.active && mouse.x !== null && mouse.y !== null) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < REPEL_RADIUS && dist > 1) {
            const force = (REPEL_RADIUS - dist) / REPEL_RADIUS;
            p.vx += (dx / dist) * force * REPEL_POWER * dt;
            p.vy += (dy / dist) * force * REPEL_POWER * dt;
          }
        }

        // Particle spring physics
        p.vx += (p.homeX - p.x) * RESTORE_FORCE * dt;
        p.vy += (p.homeY - p.y) * RESTORE_FORCE * dt;
        p.vx *= Math.pow(DAMPING, dt);
        p.vy *= Math.pow(DAMPING, dt);
        
        p.x += p.vx * dt + swayX;
        p.y += p.vy * dt + swayY;

        // Queue coordinates for batch path drawing
        particlePaths[colorIndex].lines.push({ x1: p.x, y1: p.y, x2: p.x - p.vx * 1.5, y2: p.y - p.vy * 1.5 });
        particlePaths[colorIndex].dots.push({ x: p.x, y: p.y, r: p.radius });
      }

      // Draw batch motion-blur trails (lines)
      for (let c = 0; c < 3; c++) {
        ctx.beginPath();
        const color = themeColors[c];
        ctx.strokeStyle = "rgba(" + color[0] + ", " + color[1] + ", " + color[2] + ", 0.22)";
        ctx.lineWidth = 1.6;
        
        const paths = particlePaths[c].lines;
        for (let j = 0; j < paths.length; j++) {
          const ln = paths[j];
          ctx.moveTo(ln.x1, ln.y1);
          ctx.lineTo(ln.x2, ln.y2);
        }
        ctx.stroke();
      }

      // Draw batch particle heads (dots)
      for (let c = 0; c < 3; c++) {
        ctx.beginPath();
        const color = themeColors[c];
        ctx.fillStyle = "rgba(" + color[0] + ", " + color[1] + ", " + color[2] + ", 0.42)";
        
        const dots = particlePaths[c].dots;
        for (let j = 0; j < dots.length; j++) {
          const dtObj = dots[j];
          ctx.moveTo(dtObj.x + dtObj.r, dtObj.y);
          ctx.arc(dtObj.x, dtObj.y, dtObj.r, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      // 2. Update & Draw Falling Leaves
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        const sway = Math.sin(time * leaf.swaySpeed + leaf.seed) * 0.35 * dt;

        // Leaf wind repulsion
        if (mouse.active && mouse.x !== null && mouse.y !== null) {
          const dx = leaf.x - mouse.x;
          const dy = leaf.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < LEAF_REPEL_RADIUS && dist > 1) {
            const force = (LEAF_REPEL_RADIUS - dist) / LEAF_REPEL_RADIUS;
            leaf.vx += (dx / dist) * force * LEAF_REPEL_POWER * dt;
            leaf.vy += (dy / dist) * force * LEAF_REPEL_POWER * dt;
            leaf.angle += (dx > 0 ? 0.08 : -0.08) * force * dt;
          }
        }

        // Apply leaf velocities
        leaf.vx *= Math.pow(LEAF_DAMPING, dt);
        leaf.vy *= Math.pow(LEAF_DAMPING, dt);

        leaf.x += leaf.vx * dt + sway;
        leaf.y += leaf.vy * dt + leaf.speedY * dt;
        leaf.angle += leaf.spinSpeed * dt;

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

        ctx.save();
        ctx.translate(leaf.x, leaf.y);
        ctx.rotate(leaf.angle);
        
        ctx.beginPath();
        ctx.moveTo(0, -leaf.height / 2);
        ctx.quadraticCurveTo(leaf.width / 2, 0, 0, leaf.height / 2);
        ctx.quadraticCurveTo(-leaf.width / 2, 0, 0, -leaf.height / 2);
        ctx.fillStyle = leaf.color;
        ctx.fill();

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

    animationFrameId = requestAnimationFrame(animate);

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