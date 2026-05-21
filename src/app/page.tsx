'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Folder, Plus, ExternalLink, Trash2, Edit2, Check, X,
  Search, Link as LinkIcon, Compass, FolderPlus,
  ArrowRight, Sparkles, HelpCircle, Network, List, AlertCircle,
  Upload, Image as ImageIcon, Settings, Info
} from 'lucide-react';

// Types
type Tab = {
  id: string;
  title: string;
  url: string;
  folderId: string; // Must belong to a folder
  createdAt: number;
  screenshot?: string; // Base64 compressed image string
};

type TabFolder = {
  id: string;
  name: string;
  color: string;
  createdAt: number;
};

// Preset colors for folders (neon / modern HSL colors)
const PRESET_COLORS = [
  '#ff79c6', // Pink
  '#8be9fd', // Cyan
  '#50fa7b', // Green
  '#ffb86c', // Orange
  '#bd93f9', // Purple
  '#ff5555', // Red
  '#007aff', // Blue
  '#ffcc00', // Yellow
];

// Initial Default Data
const DEFAULT_FOLDERS: TabFolder[] = [
  { id: 'f1', name: 'Design Inspiration', color: '#ff79c6', createdAt: Date.now() },
  { id: 'f2', name: 'Development', color: '#8be9fd', createdAt: Date.now() },
  { id: 'f3', name: 'Read Later', color: '#50fa7b', createdAt: Date.now() },
];

const DEFAULT_TABS: Tab[] = [
  { id: 't1', title: 'Awwwards - Website Awards', url: 'https://www.awwwards.com/', folderId: 'f1', createdAt: Date.now() - 3600000 * 3 },
  { id: 't2', title: 'Next.js Documentation', url: 'https://nextjs.org/docs', folderId: 'f2', createdAt: Date.now() - 3600000 * 24 },
  { id: 't3', title: 'GitHub - Where the world builds software', url: 'https://github.com/', folderId: 'f2', createdAt: Date.now() - 3600000 * 48 },
  { id: 't4', title: 'Dribbble - Discover Design', url: 'https://dribbble.com/', folderId: 'f1', createdAt: Date.now() - 3600000 * 50 },
  { id: 't5', title: 'Figma - Collaborative Design Tool', url: 'https://www.figma.com/', folderId: 'f1', createdAt: Date.now() - 3600000 * 10 },
  { id: 't6', title: 'StackOverflow - Developer Community', url: 'https://stackoverflow.com/', folderId: 'f2', createdAt: Date.now() - 3600000 * 12 },
  { id: 't7', title: 'Notion - Your Connected Workspace', url: 'https://www.notion.so/', folderId: 'f3', createdAt: Date.now() - 3600000 * 5 },
];

// Helper to format dates
function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// Regex to check if text is a URL
const URL_REGEX = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/i;

// Client side image compressor
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Target resolution for high quality Full HD fullscreen preview
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;
        
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        // Compress as JPEG with 85% quality for Full HD sharpness and low storage footprint
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// Canvas Relation Graph Component with Zoom, Pan, Favicons and curved neon connections
function RelationGraph({ 
  folders, 
  tabs, 
  onNodeOpen 
}: { 
  folders: TabFolder[]; 
  tabs: Tab[]; 
  onNodeOpen: (url: string) => void 
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Ref cache for pre-loaded site favicons
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});
  
  // React state for positioning rich tooltips
  const [hoveredNode, setHoveredNode] = useState<{ 
    label: string; 
    type: 'root' | 'folder' | 'tab';
    url?: string; 
    screenshot?: string;
    color?: string;
    x: number; 
    y: number; 
  } | null>(null);

  // Zoom & Pan References (avoid React render lags in Canvas loop)
  const zoomRef = useRef<number>(1);
  const panXRef = useRef<number>(0);
  const panYRef = useRef<number>(0);

  // Node structures
  interface GraphNode {
    id: string;
    label: string;
    type: 'root' | 'folder' | 'tab';
    color: string;
    url?: string;
    screenshot?: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
  }

  interface GraphLink {
    source: GraphNode;
    target: GraphNode;
    length: number;
  }

  // Pre-load favicons in imageCacheRef
  useEffect(() => {
    tabs.forEach(tab => {
      if (imageCacheRef.current[tab.id]) return;
      const img = new Image();
      // Fetch 64px favicon from Google Service
      img.src = `https://www.google.com/s2/favicons?domain=${tab.url}&sz=64`;
      img.onload = () => {
        imageCacheRef.current[tab.id] = img;
      };
    });
  }, [tabs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = canvas.width = containerRef.current?.clientWidth || 800;
    let height = canvas.height = containerRef.current?.clientHeight || 500;

    // Build Graph Nodes
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // Root Core
    const rootNode: GraphNode = {
      id: 'root',
      label: 'Library',
      type: 'root',
      color: '#ffffff',
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      radius: 22
    };
    nodes.push(rootNode);

    // Folders Mapping
    const folderNodeMap: Record<string, GraphNode> = {};
    folders.forEach((folder, idx) => {
      const angle = (idx / folders.length) * Math.PI * 2;
      const dist = 140;
      const folderNode: GraphNode = {
        id: folder.id,
        label: folder.name,
        type: 'folder',
        color: folder.color,
        x: width / 2 + Math.cos(angle) * dist,
        y: height / 2 + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: 16
      };
      nodes.push(folderNode);
      folderNodeMap[folder.id] = folderNode;

      links.push({
        source: rootNode,
        target: folderNode,
        length: 120
      });
    });

    // Tabs Mapping
    tabs.forEach((tab) => {
      const parentFolder = folderNodeMap[tab.folderId];
      if (!parentFolder) return;
      const angle = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 40;
      const tabNode: GraphNode = {
        id: tab.id,
        label: tab.title,
        type: 'tab',
        color: parentFolder.color,
        url: tab.url,
        screenshot: tab.screenshot,
        x: parentFolder.x + Math.cos(angle) * dist,
        y: parentFolder.y + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: 12
      };
      nodes.push(tabNode);
      links.push({
        source: parentFolder,
        target: tabNode,
        length: 70
      });
    });

    // Drag, Pan, Hover State variables
    let draggedNode: GraphNode | null = null;
    let isDraggingNode = false;
    let isPanning = false;
    
    let dragStartMouseX = 0;
    let dragStartMouseY = 0;
    let dragStartPanX = 0;
    let dragStartPanY = 0;

    const handleResize = () => {
      if (!canvas || !containerRef.current) return;
      width = canvas.width = containerRef.current.clientWidth;
      height = canvas.height = containerRef.current.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    // Zoom event
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const prevZoom = zoomRef.current;
      const nextZoom = Math.max(0.3, Math.min(3, prevZoom * zoomFactor));

      panXRef.current = mouseX - (mouseX - panXRef.current) * (nextZoom / prevZoom);
      panYRef.current = mouseY - (mouseY - panYRef.current) * (nextZoom / prevZoom);
      zoomRef.current = nextZoom;
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    // Physics constants
    let particleOffset = 0;
    let rootCoreAngle = 0;

    const updatePhysics = () => {
      particleOffset = (particleOffset + 0.6) % 100;
      rootCoreAngle += 0.005;

      // 1. Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i];
          const n2 = nodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist === 0) dist = 0.1;

          // Push nodes apart if they violate minimum bounds
          const minDist = n1.radius + n2.radius + 50;
          if (dist < minDist) {
            const force = (minDist - dist) * 0.08;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            if (n1 !== rootNode && n1 !== draggedNode) {
              n1.vx -= fx;
              n1.vy -= fy;
            }
            if (n2 !== draggedNode) {
              n2.vx += fx;
              n2.vy += fy;
            }
          }
        }
      }

      // 2. Link Attraction (Elastic spring)
      links.forEach(link => {
        const dx = link.target.x - link.source.x;
        const dy = link.target.y - link.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const force = (dist - link.length) * 0.015;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (link.source !== rootNode && link.source !== draggedNode) {
          link.source.vx += fx;
          link.source.vy += fy;
        }
        if (link.target !== draggedNode) {
          link.target.vx -= fx;
          link.target.vy -= fy;
        }
      });

      // 3. Central Gravity pull toward Core
      nodes.forEach(node => {
        if (node === rootNode) {
          // core slowly centers
          const dx = width / 2 - node.x;
          const dy = height / 2 - node.y;
          node.x += dx * 0.05;
          node.y += dy * 0.05;
          return;
        }
        if (node === draggedNode) return;

        const dx = rootNode.x - node.x;
        const dy = rootNode.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        node.vx += (dx / dist) * 0.03;
        node.vy += (dy / dist) * 0.03;

        // Apply friction and move
        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;

        // Boundary constraint push
        const margin = 40;
        if (node.x < margin) { node.x = margin; node.vx = 0; }
        if (node.x > width - margin) { node.x = width - margin; node.vx = 0; }
        if (node.y < margin) { node.y = margin; node.vy = 0; }
        if (node.y > height - margin) { node.y = height - margin; node.vy = 0; }
      });
    };

    const drawGraph = () => {
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      // Apply Zoom & Pan
      ctx.translate(panXRef.current, panYRef.current);
      ctx.scale(zoomRef.current, zoomRef.current);

      // Draw Connections (Curved Bezier Paths with neon gradients)
      links.forEach(link => {
        const dx = link.target.x - link.source.x;
        const dy = link.target.y - link.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;

        // Calculate control point for curved line
        const midX = (link.source.x + link.target.x) / 2;
        const midY = (link.source.y + link.target.y) / 2;
        // perpendicular offset for curve
        const nx = -dy / dist;
        const ny = dx / dist;
        const curveOffset = link.source.type === 'root' ? 25 : 12;
        const cx = midX + nx * curveOffset;
        const cy = midY + ny * curveOffset;

        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.quadraticCurveTo(cx, cy, link.target.x, link.target.y);
        
        // Gradient color from source node to target node
        const grad = ctx.createLinearGradient(link.source.x, link.source.y, link.target.x, link.target.y);
        grad.addColorStop(0, link.source.color === '#ffffff' ? 'rgba(255,255,255,0.08)' : `${link.source.color}15`);
        grad.addColorStop(1, `${link.target.color}35`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = link.source.type === 'root' ? 2 : 1;
        ctx.stroke();

        // Flowing light particles along curves
        const count = link.source.type === 'root' ? 1 : 2;
        for (let i = 0; i < count; i++) {
          const t = (particleOffset / 100 + (i * 0.5)) % 1;
          const mt = 1 - t;
          // Bezier calculation
          const px = mt * mt * link.source.x + 2 * mt * t * cx + t * t * link.target.x;
          const py = mt * mt * link.source.y + 2 * mt * t * cy + t * t * link.target.y;

          // Particle outer neon glow
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = link.target.color;
          ctx.shadowBlur = 6;
          ctx.shadowColor = link.target.color;
          ctx.fill();
          ctx.shadowBlur = 0; // reset
        }
      });

      // Draw Nodes
      nodes.forEach(node => {
        ctx.save();

        if (node.type === 'root') {
          // Central Core portal rings
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 1;
          ctx.setLineDash([8, 12]);
          
          // Concentric rotating rings
          ctx.beginPath();
          ctx.arc(node.x, node.y, 40, 0, Math.PI * 2);
          ctx.stroke();

          ctx.save();
          ctx.translate(node.x, node.y);
          ctx.rotate(rootCoreAngle);
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          ctx.arc(0, 0, 32, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          // Main core sphere
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#ffffff';
          ctx.fill();
          ctx.shadowBlur = 0;

          // Core Icon indicator (draw standard letter 'S' for savetab)
          ctx.fillStyle = '#000000';
          ctx.font = "bold 13px 'Plus Jakarta Sans'";
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('S', node.x, node.y);

          // Root label below Core
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = "600 10px 'Plus Jakarta Sans'";
          ctx.fillText(node.label.toUpperCase(), node.x, node.y + 55);

        } else if (node.type === 'folder') {
          // Folder Glass sphere
          ctx.shadowBlur = 10;
          ctx.shadowColor = node.color;
          
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(8, 8, 12, 0.9)';
          ctx.fill();
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.shadowBlur = 0; // reset

          // Inner dot
          ctx.beginPath();
          ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = node.color;
          ctx.fill();

          // Folder text label
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.font = "500 10px 'Plus Jakarta Sans'";
          ctx.textAlign = 'center';
          ctx.fillText(node.label, node.x, node.y + 30);

        } else {
          // Tab Node: Render website favicon if preloaded
          const faviconImg = imageCacheRef.current[node.id];
          
          ctx.shadowBlur = 6;
          ctx.shadowColor = node.color;
          
          // Draw thin colored outline halo
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = `${node.color}55`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.shadowBlur = 0;

          if (faviconImg && faviconImg.complete && faviconImg.naturalWidth > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = '#141419';
            ctx.fill();
            // Draw image scaled inside clipping circle
            ctx.drawImage(faviconImg, node.x - node.radius, node.y - node.radius, node.radius * 2, node.radius * 2);
            ctx.restore();
          } else {
            // Fallback neon dot
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = node.color;
            ctx.fill();
          }
        }
        ctx.restore();
      });

      ctx.restore();
    };

    const render = () => {
      updatePhysics();
      drawGraph();
      animationId = requestAnimationFrame(render);
    };

    // Screen-to-world mapping for events
    const getMousePos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      return {
        screenX,
        screenY,
        worldX: (screenX - panXRef.current) / zoomRef.current,
        worldY: (screenY - panYRef.current) / zoomRef.current
      };
    };

    const onMouseDown = (e: MouseEvent) => {
      const pos = getMousePos(e);
      
      // Check if mouse clicked on any node
      let clickedNode: GraphNode | null = null;
      for (const node of nodes) {
        const dx = node.x - pos.worldX;
        const dy = node.y - pos.worldY;
        if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 6) {
          clickedNode = node;
          break;
        }
      }

      if (clickedNode) {
        draggedNode = clickedNode;
        isDraggingNode = true;
        canvas.style.cursor = 'grabbing';
      } else {
        // Start background panning
        isPanning = true;
        dragStartMouseX = e.clientX;
        dragStartMouseY = e.clientY;
        dragStartPanX = panXRef.current;
        dragStartPanY = panYRef.current;
        canvas.style.cursor = 'grabbing';
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const pos = getMousePos(e);

      if (isDraggingNode && draggedNode) {
        // Update drag coordinates in world space
        draggedNode.x = pos.worldX;
        draggedNode.y = pos.worldY;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
      } else if (isPanning) {
        // Update pan coordinates
        const dx = e.clientX - dragStartMouseX;
        const dy = e.clientY - dragStartMouseY;
        panXRef.current = dragStartPanX + dx;
        panYRef.current = dragStartPanY + dy;
      } else {
        // Find if hover is matching any node in world space
        let hoverFound = false;
        for (const node of nodes) {
          const dx = node.x - pos.worldX;
          const dy = node.y - pos.worldY;
          if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 6) {
            // Find its screen position for placing tooltip overlay
            const nodeScreenX = node.x * zoomRef.current + panXRef.current;
            const nodeScreenY = node.y * zoomRef.current + panYRef.current;

            setHoveredNode({
              label: node.label,
              type: node.type,
              url: node.url,
              screenshot: node.screenshot,
              color: node.color,
              x: nodeScreenX + 15,
              y: nodeScreenY - 15
            });
            hoverFound = true;
            break;
          }
        }
        if (!hoverFound) setHoveredNode(null);
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (isDraggingNode && draggedNode && draggedNode.type === 'tab' && draggedNode.url) {
        const pos = getMousePos(e);
        const dx = draggedNode.x - pos.worldX;
        const dy = draggedNode.y - pos.worldY;
        // Trigger visit click if dragging distance is tiny
        if (Math.sqrt(dx * dx + dy * dy) < 2) {
          onNodeOpen(draggedNode.url);
        }
      }
      
      isDraggingNode = false;
      draggedNode = null;
      isPanning = false;
      canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
    };
  }, [folders, tabs, onNodeOpen]);

  // Transform hover node coordinates relative to graph container
  const activeFolderCount = folders.length;

  return (
    <div className="graph-viewport" ref={containerRef}>
      <canvas className="graph-canvas" ref={canvasRef} style={{ cursor: 'grab' }} />
      
      {/* Premium Tooltip overlay with rich details and screenshot preview */}
      {hoveredNode && (
        <div 
          className="graph-tooltip"
          style={{ left: `${hoveredNode.x}px`, top: `${hoveredNode.y}px` }}
        >
          <span className="graph-tooltip-title">{hoveredNode.label}</span>
          
          {hoveredNode.type === 'tab' && hoveredNode.url && (
            <>
              <span className="graph-tooltip-meta">{new URL(hoveredNode.url).hostname}</span>
              {hoveredNode.screenshot && (
                <img 
                  src={hoveredNode.screenshot} 
                  alt="Page preview" 
                  className="graph-tooltip-img" 
                />
              )}
            </>
          )}

          {hoveredNode.type === 'folder' && (
            <span 
              className="graph-tooltip-folder" 
              style={{ color: hoveredNode.color, border: `1px solid ${hoveredNode.color}25`, background: `${hoveredNode.color}08` }}
            >
              Folder Workspace
            </span>
          )}

          {hoveredNode.type === 'root' && (
            <span className="graph-tooltip-folder" style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              Core Space
            </span>
          )}
        </div>
      )}

      <div className="graph-controls">
        <div className="graph-control-btn" style={{ pointerEvents: 'none' }}>
          🖱️ Drag background to Pan | Scroll to Zoom | Drag nodes to interact
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [folders, setFolders] = useState<TabFolder[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  // Lightbox Image Previewer State
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);

  // Hover floating screenshot preview state
  const [hoveredScreenshot, setHoveredScreenshot] = useState<{
    image: string;
    x: number;
    y: number;
  } | null>(null);

  const [windowHeight, setWindowHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleScroll = () => setHoveredScreenshot(null);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  // Layout mode for All Bookmarks ('list' or 'graph')
  const [allBookmarksMode, setAllBookmarksMode] = useState<'graph' | 'list'>('graph');

  // Input bindings
  const [commandText, setCommandText] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [fetchingTitle, setFetchingTitle] = useState(false);
  const [screenshot, setScreenshot] = useState<string>(''); // Temporary screenshot base64
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  
  // Drag states
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragHoverFolderId, setDragHoverFolderId] = useState<string | null>(null);

  // Edit Link Modal states
  const [editingTab, setEditingTab] = useState<Tab | null>(null);
  const [editModalTitle, setEditModalTitle] = useState('');
  const [editModalUrl, setEditModalUrl] = useState('');
  const [editModalFolderId, setEditModalFolderId] = useState('');
  const [editModalScreenshot, setEditModalScreenshot] = useState('');
  const [isEditModalFetchingTitle, setIsEditModalFetchingTitle] = useState(false);

  // Folder creation modals
  const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#ff79c6');

  // Folder editing modals
  const [editingFolder, setEditingFolder] = useState<TabFolder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderColor, setEditFolderColor] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  // Load local state
  useEffect(() => {
    setIsMounted(true);
    const savedFolders = localStorage.getItem('savetab_folders');
    const savedTabs = localStorage.getItem('savetab_tabs');
    
    if (savedFolders && savedTabs) {
      setFolders(JSON.parse(savedFolders));
      setTabs(JSON.parse(savedTabs));
    } else {
      setFolders(DEFAULT_FOLDERS);
      setTabs(DEFAULT_TABS);
      localStorage.setItem('savetab_folders', JSON.stringify(DEFAULT_FOLDERS));
      localStorage.setItem('savetab_tabs', JSON.stringify(DEFAULT_TABS));
    }
  }, []);

  // Save local state
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('savetab_folders', JSON.stringify(folders));
      localStorage.setItem('savetab_tabs', JSON.stringify(tabs));
    }
  }, [folders, tabs, isMounted]);

  // Check if inputted command text is a URL
  const isInputUrl = useMemo(() => {
    // Only allow saving urls when inside a specific folder
    if (activeFolder === null) return false;
    return URL_REGEX.test(commandText.trim());
  }, [commandText, activeFolder]);

  // Automated fetch page title on server side
  useEffect(() => {
    if (!isInputUrl) {
      setCustomTitle('');
      setScreenshot('');
      return;
    }

    let urlToFetch = commandText.trim();
    if (!/^https?:\/\//i.test(urlToFetch)) {
      urlToFetch = 'https://' + urlToFetch;
    }

    setFetchingTitle(true);
    setCustomTitle('Loading page title...');

    fetch(`/api/fetch-title?url=${encodeURIComponent(urlToFetch)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.title) {
          setCustomTitle(data.title);
        } else {
          // Fallback to domain
          const host = new URL(urlToFetch).hostname.replace('www.', '');
          setCustomTitle(host.charAt(0).toUpperCase() + host.slice(1));
        }
      })
      .catch(() => {
        try {
          const host = new URL(urlToFetch).hostname.replace('www.', '');
          setCustomTitle(host.charAt(0).toUpperCase() + host.slice(1));
        } catch {
          setCustomTitle('Untitled Link');
        }
      })
      .finally(() => {
        setFetchingTitle(false);
      });
  }, [commandText, isInputUrl]);

  // Filtered bookmarks list (search query filtering)
  const filteredTabs = useMemo(() => {
    let result = tabs;
    
    // Filter by active folder context
    if (activeFolder !== null) {
      result = result.filter(tab => tab.folderId === activeFolder);
    }
    
    // Filter by search query if it is not a URL
    if (commandText.trim() && !isInputUrl) {
      const query = commandText.toLowerCase();
      result = result.filter(tab => 
        tab.title.toLowerCase().includes(query) || 
        tab.url.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [tabs, activeFolder, commandText, isInputUrl]);

  // Reset keyboard cursor on changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [filteredTabs]);

  // Keyboard navigation logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      
      if (e.key === '/' && document.activeElement !== inputRef.current && document.activeElement !== dropdownInputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      const isInputFocused = document.activeElement === inputRef.current;
      const isDropdownFocused = document.activeElement === dropdownInputRef.current;
      
      if (e.key === 'ArrowDown') {
        if (!isDropdownFocused) {
          e.preventDefault();
          setSelectedIndex(prev => (prev < filteredTabs.length - 1 ? prev + 1 : prev));
        }
      } else if (e.key === 'ArrowUp') {
        if (!isDropdownFocused) {
          e.preventDefault();
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (activeLightboxImage) {
          setActiveLightboxImage(null);
        } else {
          setCommandText('');
          inputRef.current?.blur();
          dropdownInputRef.current?.blur();
          setSelectedIndex(-1);
        }
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && selectedIndex < filteredTabs.length && !isInputFocused && !isDropdownFocused) {
          e.preventDefault();
          window.open(filteredTabs[selectedIndex].url, '_blank', 'noopener,noreferrer');
        } else if (isInputUrl && isInputFocused) {
          e.preventDefault();
          dropdownInputRef.current?.focus();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isInputFocused && !isDropdownFocused && selectedIndex >= 0 && selectedIndex < filteredTabs.length) {
          e.preventDefault();
          const tabToDelete = filteredTabs[selectedIndex];
          setTabs(prev => prev.filter(t => t.id !== tabToDelete.id));
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredTabs, selectedIndex, isInputUrl, activeLightboxImage]);

  // Handle clipboard pastes for screenshots in add/edit links
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      // Paste files directly when editing or adding tabs
      const isDropdownInputFocused = document.activeElement === dropdownInputRef.current;
      const isEditModalOpen = !!editingTab;
      
      if (!isDropdownInputFocused && !isEditModalOpen) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            try {
              const compressed = await compressImage(file);
              if (isEditModalOpen) {
                setEditModalScreenshot(compressed);
              } else {
                setScreenshot(compressed);
              }
            } catch (err) {
              console.error('Failed to compress clipboard screenshot:', err);
            }
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [editingTab]);

  // Save bookmark handler (restricted strictly to folders)
  const triggerSaveTab = () => {
    if (!commandText.trim()) return;
    
    // Must save to a valid folder
    if (!activeFolder) {
      alert("Bookmarks can only be saved inside folders. Please select a folder first.");
      return;
    }

    let formattedUrl = commandText.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const finalTitle = customTitle.trim() || 'Untitled Bookmark';

    const newTab: Tab = {
      id: `t_${Date.now()}`,
      title: finalTitle,
      url: formattedUrl,
      folderId: activeFolder,
      createdAt: Date.now(),
      screenshot: screenshot || undefined
    };

    setTabs(prev => [newTab, ...prev]);
    setCommandText('');
    setCustomTitle('');
    setScreenshot('');
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  // Open Edit Tab Modal
  const openEditTabModal = (tab: Tab) => {
    setEditingTab(tab);
    setEditModalTitle(tab.title);
    setEditModalUrl(tab.url);
    setEditModalFolderId(tab.folderId);
    setEditModalScreenshot(tab.screenshot || '');
  };

  // Save Tab updates
  const saveTabEdits = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTab || !editModalTitle.trim() || !editModalUrl.trim() || !editModalFolderId) return;

    let formattedUrl = editModalUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    setTabs(prev => prev.map(tab => 
      tab.id === editingTab.id 
        ? { 
            ...tab, 
            title: editModalTitle.trim(), 
            url: formattedUrl, 
            folderId: editModalFolderId,
            screenshot: editModalScreenshot || undefined
          } 
        : tab
    ));

    setEditingTab(null);
  };

  // Drag and drop screenshot handlers (for create link dropdown)
  const handleScreenshotDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      try {
        const compressed = await compressImage(file);
        setScreenshot(compressed);
      } catch (err) {
        console.error('Failed to compress dropped file:', err);
      }
    }
  };

  const handleScreenshotFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setScreenshot(compressed);
      } catch (err) {
        console.error('Failed to compress loaded file:', err);
      }
    }
  };

  // Drag and drop screenshot handlers (for edit link modal)
  const handleEditScreenshotDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      try {
        const compressed = await compressImage(file);
        setEditModalScreenshot(compressed);
      } catch (err) {
        console.error('Failed to compress dropped file:', err);
      }
    }
  };

  const handleEditScreenshotFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setEditModalScreenshot(compressed);
      } catch (err) {
        console.error('Failed to compress loaded file:', err);
      }
    }
  };

  // Add Folder handler
  const handleAddFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const newFolder: TabFolder = {
      id: `f_${Date.now()}`,
      name: newFolderName.trim(),
      color: newFolderColor,
      createdAt: Date.now(),
    };
    
    setFolders(prev => [...prev, newFolder]);
    setNewFolderName('');
    setNewFolderColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
    setIsAddFolderModalOpen(false);
    setActiveFolder(newFolder.id);
  };

  // Open Edit Folder settings modal
  const openEditFolderSettings = (e: React.MouseEvent, folder: TabFolder) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingFolder(folder);
    setEditFolderName(folder.name);
    setEditFolderColor(folder.color);
  };

  // Save Folder Settings
  const saveFolderSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder || !editFolderName.trim() || !editFolderColor) return;

    setFolders(prev => prev.map(f => 
      f.id === editingFolder.id 
        ? { ...f, name: editFolderName.trim(), color: editFolderColor } 
        : f
    ));
    setEditingFolder(null);
  };

  // Delete folder
  const handleDeleteFolder = (folderId: string) => {
    if (confirm("Are you sure you want to delete this folder? All of its tabs will be deleted as well.")) {
      setFolders(prev => prev.filter(f => f.id !== folderId));
      setTabs(prev => prev.filter(tab => tab.folderId !== folderId));
      if (activeFolder === folderId) setActiveFolder(null);
      setEditingFolder(null);
    }
  };

  // Tab drag & drop positioning handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedTabId(id);
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragEnd = () => {
    setDraggedTabId(null);
    setDragHoverFolderId(null);
  };

  const handleDragOverFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    if (draggedTabId) {
      setDragHoverFolderId(folderId);
    }
  };

  const handleDragLeaveFolder = () => {
    setDragHoverFolderId(null);
  };

  const handleDropOnFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    const tabId = e.dataTransfer.getData('text/plain');
    if (tabId) {
      setTabs(prev => prev.map(tab => 
        tab.id === tabId ? { ...tab, folderId } : tab
      ));
    }
    setDraggedTabId(null);
    setDragHoverFolderId(null);
  };

  const handleDeleteTab = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Delete this bookmark?")) {
      setTabs(prev => prev.filter(tab => tab.id !== id));
    }
  };

  const activeFolderName = activeFolder ? folders.find(f => f.id === activeFolder)?.name : 'All bookmarks';

  if (!isMounted) return null;

  return (
    <>
      {/* Atmospheric lighting */}
      <div className="bg-mesh" />
      <div className="bg-grid-overlay" />

      {/* Main Fullbleed UI Frame */}
      <div className="app-frame">
        
        {/* Floating sidebar navigator */}
        <aside className="sidebar">
          <div className="logo-section">
            <div className="logo-symbol">S</div>
            <span className="logo-text">savetab</span>
          </div>

          <div className="nav-label">Library</div>
          <nav className="nav-list">
            <div 
              className={`nav-item ${activeFolder === null ? 'active' : ''}`}
              onClick={() => setActiveFolder(null)}
              style={{ color: '#fff' }}
            >
              <div className="nav-item-inner">
                <Compass size={14} />
                <span>All bookmarks</span>
              </div>
              <span className="nav-count">{tabs.length}</span>
            </div>
          </nav>

          <div className="nav-label">Folders</div>
          <nav className="nav-list" style={{ overflowY: 'auto', flex: 1 }}>
            {folders.map(folder => {
              const folderTabCount = tabs.filter(t => t.folderId === folder.id).length;
              const isTargetHover = dragHoverFolderId === folder.id;
              
              return (
                <div 
                  key={folder.id} 
                  className={`nav-item ${activeFolder === folder.id ? 'active' : ''} ${isTargetHover ? 'drag-hover' : ''}`}
                  onClick={() => setActiveFolder(folder.id)}
                  onDragOver={(e) => handleDragOverFolder(e, folder.id)}
                  onDragLeave={handleDragLeaveFolder}
                  onDrop={(e) => handleDropOnFolder(e, folder.id)}
                  style={{ color: folder.color }}
                >
                  <div className="nav-item-inner">
                    <Folder size={14} style={{ color: folder.color, fill: `${folder.color}25` }} />
                    <span style={{ color: '#fff' }}>{folder.name}</span>
                  </div>
                  <div className="nav-item-inner">
                    <span className="nav-count">{folderTabCount}</span>
                    <div className="nav-item-actions" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={(e) => openEditFolderSettings(e, folder)}
                        className="nav-edit-btn"
                        title="Folder Settings"
                      >
                        <Settings size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>

          <button 
            className="sidebar-action-btn"
            onClick={() => setIsAddFolderModalOpen(true)}
          >
            <FolderPlus size={14} />
            New folder
          </button>
        </aside>

        {/* Main Interface Workspace */}
        <main className="main-viewport">
          <header className="viewport-header">
            <div>
              <h2 className="viewport-title">{activeFolderName}</h2>
              <span className="viewport-subtitle">{filteredTabs.length} item{filteredTabs.length !== 1 ? 's' : ''} saved</span>
            </div>

            {/* Toggle Graph vs List for All Bookmarks view */}
            {activeFolder === null && tabs.length > 0 && (
              <div className="view-toggle-bar">
                <button 
                  className={`view-toggle-btn ${allBookmarksMode === 'graph' ? 'active' : ''}`}
                  onClick={() => setAllBookmarksMode('graph')}
                >
                  <Network size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  Graph
                </button>
                <button 
                  className={`view-toggle-btn ${allBookmarksMode === 'list' ? 'active' : ''}`}
                  onClick={() => setAllBookmarksMode('list')}
                >
                  <List size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  List
                </button>
              </div>
            )}
          </header>

          {/* Dynamic Spotlight Input Panel */}
          <div className="command-container">
            <div className="command-bar">
              <Search size={16} className="command-icon" />
              <input 
                ref={inputRef}
                type="text" 
                className="command-input" 
                placeholder={
                  activeFolder 
                    ? `Paste a URL to save to ${activeFolderName}... or search...` 
                    : folders.length === 0 
                      ? "Create a folder first to save bookmarks..." 
                      : "Search bookmarks... (Select a folder to save new tabs)"
                } 
                value={commandText}
                onChange={e => setCommandText(e.target.value)}
              />
              <div className="command-actions">
                <span className="command-badge">
                  <span>⌘</span><span>K</span>
                </span>
              </div>
            </div>

            {/* Save Bookmark Form - visible only when inside a folder and a URL is pasted */}
            {isInputUrl && activeFolder && (
              <div className="command-dropdown" onClick={e => e.stopPropagation()}>
                <span className="dropdown-prompt-title">Save Bookmark in {activeFolderName}</span>
                <div className="dropdown-input-group">
                  <div className="dropdown-input-container">
                    <input 
                      ref={dropdownInputRef}
                      type="text" 
                      className="dropdown-input" 
                      placeholder="Bookmark Title..." 
                      value={customTitle}
                      onChange={e => setCustomTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          triggerSaveTab();
                        }
                      }}
                      disabled={fetchingTitle}
                    />
                    {fetchingTitle && <div className="title-fetch-spinner" />}
                  </div>

                  <button 
                    onClick={triggerSaveTab} 
                    className="dropdown-submit-btn"
                    disabled={fetchingTitle}
                  >
                    Save Link
                  </button>
                </div>

                {/* Screenshot Uploader */}
                <div className="screenshot-upload-section">
                  <span className="dropdown-prompt-title">Attach Screenshot</span>
                  {screenshot ? (
                    <div className="screenshot-preview-container" style={{ cursor: 'zoom-in' }}>
                      <img 
                        src={screenshot} 
                        alt="Screenshot preview" 
                        className="screenshot-preview" 
                        onClick={() => setActiveLightboxImage(screenshot)}
                      />
                      <button onClick={() => setScreenshot('')} className="remove-screenshot-btn" title="Remove screenshot">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div 
                      ref={dropzoneRef}
                      className="screenshot-dropzone"
                      onDragOver={e => e.preventDefault()}
                      onDrop={handleScreenshotDrop}
                    >
                      <span>Drag & drop a screenshot file here, or </span>
                      <label className="upload-label">
                        browse file
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden-file-input" 
                          onChange={handleScreenshotFileChange} 
                        />
                      </label>
                      <span className="clipboard-tip">(or press Ctrl+V to paste from clipboard)</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Informational banner when pasting URL in All Bookmarks */}
          {activeFolder === null && URL_REGEX.test(commandText.trim()) && (
            <div className="all-bookmarks-info-banner">
              <Info size={16} className="info-icon" />
              <span>Bookmarks cannot be saved directly into "All Bookmarks". Select or create a folder in the sidebar to save this link.</span>
            </div>
          )}

          {/* Workspace Graph vs list representation */}
          {activeFolder === null && allBookmarksMode === 'graph' && tabs.length > 0 ? (
            <RelationGraph folders={folders} tabs={tabs} onNodeOpen={(url) => window.open(url, '_blank')} />
          ) : (
            <div className="scrollable-content">
              {filteredTabs.length === 0 ? (
                <div className="empty-illustration">
                  <LinkIcon size={28} style={{ color: 'var(--text-muted)' }} />
                  <h3 className="empty-title">Workspace empty</h3>
                  <p className="empty-desc">
                    {folders.length === 0 
                      ? "Create a folder in the sidebar to start organizing."
                      : activeFolder 
                        ? "No tabs saved inside this folder yet. Paste a URL above to add one!"
                        : "No bookmarks match your search filters."}
                  </p>
                </div>
              ) : (
                filteredTabs.map((tab, idx) => {
                  const isSelected = selectedIndex === idx;
                  const tabFolder = folders.find(f => f.id === tab.folderId);
                  
                  return (
                    <div 
                      key={tab.id}
                      className={`tab-card ${isSelected ? 'selected' : ''} ${draggedTabId === tab.id ? 'dragging' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, tab.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => window.open(tab.url, '_blank')}
                      style={{ animationDelay: `${idx * 0.03}s` }}
                      onMouseEnter={(e) => {
                        if (tab.screenshot) {
                          const cardEl = e.currentTarget;
                          const thumbEl = cardEl.querySelector('.tab-thumbnail-indicator');
                          const targetRect = thumbEl ? thumbEl.getBoundingClientRect() : cardEl.getBoundingClientRect();
                          setHoveredScreenshot({
                            image: tab.screenshot,
                            x: targetRect.left - 230,
                            y: targetRect.top - 50,
                          });
                        }
                      }}
                      onMouseLeave={() => setHoveredScreenshot(null)}
                    >
                      <div className="tab-left">
                        <div className="favicon-container">
                          <img 
                            className="favicon-img"
                            src={`https://www.google.com/s2/favicons?domain=${tab.url}&sz=32`} 
                            alt="" 
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        </div>
                        <div className="tab-details">
                          <div className="tab-title-container">
                            <span className="tab-title">{tab.title}</span>
                          </div>

                          <div className="tab-url-row">
                            <span className="tab-url">{new URL(tab.url).hostname}</span>
                            {activeFolder === null && tabFolder && (
                              <span 
                                className="folder-badge" 
                                style={{ color: tabFolder.color, borderColor: `${tabFolder.color}25`, background: `${tabFolder.color}08` }}
                              >
                                {tabFolder.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="tab-right" onClick={e => e.stopPropagation()}>
                        {/* Show small thumbnail image indicator if screenshot exists */}
                        {tab.screenshot && (
                          <div 
                            style={{ position: 'relative', cursor: 'zoom-in' }}
                            onClick={() => setActiveLightboxImage(tab.screenshot || null)}
                          >
                            <img 
                              src={tab.screenshot} 
                              alt="Thumbnail preview" 
                              className="tab-thumbnail-indicator" 
                            />
                          </div>
                        )}

                        <span className="tab-meta">{formatTimeAgo(tab.createdAt)}</span>
                        
                        <div className="actions-row">
                          <button 
                            onClick={() => openEditTabModal(tab)}
                            className="action-btn"
                            title="Edit Link Details"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button 
                            onClick={(e) => handleDeleteTab(e, tab.id)}
                            className="action-btn danger"
                            title="Delete link"
                          >
                            <Trash2 size={13} />
                          </button>
                          <a 
                            href={tab.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="action-btn"
                            title="Visit link"
                          >
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modal: Create Folder */}
      {isAddFolderModalOpen && (
        <div className="premium-overlay" onClick={() => setIsAddFolderModalOpen(false)}>
          <div className="premium-dialog" onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <h2 className="viewport-title" style={{ fontSize: '1.25rem' }}>Create folder</h2>
              <p className="dialog-desc">Create a workspace to group your tabs.</p>
            </div>
            
            <form onSubmit={handleAddFolder}>
              <div className="form-group">
                <label className="form-label">Folder Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Work, Articles, Dev" 
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <div className="color-presets-label">
                  <label className="form-label">Select Color</label>
                </div>
                <div className="color-presets">
                  {PRESET_COLORS.map(color => (
                    <div 
                      key={color}
                      className={`color-chip ${newFolderColor === color ? 'active' : ''}`}
                      style={{ backgroundColor: color, color: color }}
                      onClick={() => setNewFolderColor(color)}
                    />
                  ))}
                </div>

                <label className="custom-color-trigger">
                  <div className="custom-color-indicator" style={{ backgroundColor: newFolderColor }} />
                  <span className="form-label" style={{ margin: 0, textTransform: 'none', cursor: 'pointer' }}>Custom Hex Color...</span>
                  <input 
                    type="color" 
                    className="custom-color-picker" 
                    value={newFolderColor}
                    onChange={e => setNewFolderColor(e.target.value)}
                  />
                </label>
              </div>

              <div className="dialog-buttons">
                <button type="button" className="btn-secondary" onClick={() => setIsAddFolderModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Folder</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Folder Settings */}
      {editingFolder && (
        <div className="premium-overlay" onClick={() => setEditingFolder(null)}>
          <div className="premium-dialog" onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <h2 className="viewport-title" style={{ fontSize: '1.25rem' }}>Folder Settings</h2>
              <p className="dialog-desc">Edit name and color properties of the folder.</p>
            </div>

            <form onSubmit={saveFolderSettings}>
              <div className="form-group">
                <label className="form-label">Folder Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editFolderName}
                  onChange={e => setEditFolderName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <div className="color-presets-label">
                  <label className="form-label">Select Color</label>
                </div>
                <div className="color-presets">
                  {PRESET_COLORS.map(color => (
                    <div 
                      key={color}
                      className={`color-chip ${editFolderColor === color ? 'active' : ''}`}
                      style={{ backgroundColor: color, color: color }}
                      onClick={() => setEditFolderColor(color)}
                    />
                  ))}
                </div>

                <label className="custom-color-trigger">
                  <div className="custom-color-indicator" style={{ backgroundColor: editFolderColor }} />
                  <span className="form-label" style={{ margin: 0, textTransform: 'none', cursor: 'pointer' }}>Custom Hex Color...</span>
                  <input 
                    type="color" 
                    className="custom-color-picker" 
                    value={editFolderColor}
                    onChange={e => setEditFolderColor(e.target.value)}
                  />
                </label>
              </div>

              <div className="dialog-buttons" style={{ justifyContent: 'space-between' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => handleDeleteFolder(editingFolder.id)}
                  style={{ color: 'var(--accent-red)', borderColor: 'rgba(255, 69, 58, 0.15)' }}
                >
                  Delete Folder
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setEditingFolder(null)}>Cancel</button>
                  <button type="submit" className="btn-primary">Save Changes</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Link Details (Detailed view edit link) */}
      {editingTab && (
        <div className="premium-overlay" onClick={() => setEditingTab(null)}>
          <div className="premium-dialog" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <h2 className="viewport-title" style={{ fontSize: '1.25rem' }}>Edit Link</h2>
              <p className="dialog-desc">Update link information, folder workspace, and screenshot.</p>
            </div>

            <form onSubmit={saveTabEdits}>
              <div className="form-group">
                <label className="form-label">Link Title</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editModalTitle}
                  onChange={e => setEditModalTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">URL Address</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editModalUrl}
                  onChange={e => setEditModalUrl(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Move to Folder</label>
                <select 
                  className="form-select"
                  value={editModalFolderId}
                  onChange={e => setEditModalFolderId(e.target.value)}
                >
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Edit Screenshot upload block */}
              <div className="screenshot-upload-section">
                <span className="form-label">Screenshot Preview</span>
                {editModalScreenshot ? (
                  <div className="screenshot-preview-container" style={{ maxHeight: '180px', cursor: 'zoom-in' }}>
                    <img 
                      src={editModalScreenshot} 
                      alt="Screenshot preview" 
                      className="screenshot-preview" 
                      onClick={() => setActiveLightboxImage(editModalScreenshot)}
                    />
                    <button type="button" onClick={() => setEditModalScreenshot('')} className="remove-screenshot-btn" title="Remove screenshot">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div 
                    className="screenshot-dropzone"
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleEditScreenshotDrop}
                  >
                    <span>Drag & drop a new screenshot file here, or </span>
                    <label className="upload-label">
                      browse file
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden-file-input" 
                        onChange={handleEditScreenshotFileChange} 
                      />
                    </label>
                    <span className="clipboard-tip">(or press Ctrl+V to paste from clipboard)</span>
                  </div>
                )}
              </div>

              <div className="dialog-buttons">
                <button type="button" className="btn-secondary" onClick={() => setEditingTab(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {activeLightboxImage && (
        <div className="lightbox-overlay" onClick={() => setActiveLightboxImage(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close-btn" onClick={() => setActiveLightboxImage(null)}>
              <X size={16} /> Close
            </button>
            <img src={activeLightboxImage} alt="Fullscreen preview" className="lightbox-img" />
          </div>
        </div>
      )}

      {/* Global Hover Screenshot Preview (Fixed to prevent clipping) */}
      <div 
        className={`screenshot-hover-preview-fixed ${hoveredScreenshot ? 'active' : ''}`}
        style={{ 
          left: hoveredScreenshot ? `${Math.max(10, hoveredScreenshot.x)}px` : '0px', 
          top: hoveredScreenshot ? `${Math.max(10, Math.min(windowHeight - 134, hoveredScreenshot.y))}px` : '0px' 
        }}
      >
        {hoveredScreenshot && <img src={hoveredScreenshot.image} alt="Page preview" />}
      </div>
    </>
  );
}
