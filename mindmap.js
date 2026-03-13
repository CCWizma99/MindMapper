/**
 * MindMap Renderer — D3.js powered interactive mind map
 */

// Each top-level branch gets its own color palette [base, mid, light]
const BRANCH_PALETTES = [
  ['#6366f1', '#818cf8', '#a5b4fc'],   // indigo
  ['#10b981', '#34d399', '#6ee7b7'],   // emerald
  ['#f59e0b', '#fbbf24', '#fcd34d'],   // amber
  ['#ef4444', '#f87171', '#fca5a5'],   // red
  ['#3b82f6', '#60a5fa', '#93c5fd'],   // blue
  ['#ec4899', '#f472b6', '#f9a8d4'],   // pink
  ['#8b5cf6', '#a78bfa', '#c4b5fd'],   // violet
  ['#14b8a6', '#2dd4bf', '#5eead4'],   // teal
  ['#f97316', '#fb923c', '#fdba74'],   // orange
  ['#06b6d4', '#22d3ee', '#67e8f9'],   // cyan
];

const ROOT_COLOR = '#6366f1';

class MindMapRenderer {
  constructor(container) {
    this.container = container;
    this.data = null;
    this.svg = null;
    this.g = null;
    this.zoom = null;
    this.treeLayout = null;
    this.tooltip = null;
    this.nodeId = 0;
    this.duration = 400;
    this.showDescriptions = true;
    this.searchTerm = '';

    this._init();
  }

  _init() {
    // Create SVG
    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%');

    // Create a group for zoom/pan
    this.g = this.svg.append('g').attr('class', 'mindmap-root');

    // Setup zoom
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);

    // Create tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.innerHTML = '<div class="tooltip__title"></div><div class="tooltip__body"></div>';
    document.body.appendChild(this.tooltip);
  }

  render(data) {
    this.data = data;
    this.nodeId = 0;

    // Assign IDs recursively
    this._assignIds(this.data);

    // Initial collapse: collapse nodes deeper than level 2
    this._initialCollapse(this.data, 0);

    // Create tree layout
    this._updateLayout();

    // Center the view
    this._centerView();
  }

  _assignIds(node) {
    node.id = node.id || ++this.nodeId;
    if (node.children) {
      node.children.forEach(c => this._assignIds(c));
    }
  }

  _initialCollapse(node, depth) {
    if (node.children) {
      node.children.forEach(c => this._initialCollapse(c, depth + 1));
      if (depth >= 2) {
        node._children = node.children;
        node.children = null;
      }
    }
  }

  _updateLayout() {
    // Count visible leaves to calculate tree height
    const root = d3.hierarchy(this.data, d => d.children);
    const leaves = root.leaves().length;
    const treeHeight = Math.max(leaves * 48, 600);
    const treeWidth = Math.max(root.height * 340, 900);

    this.treeLayout = d3.tree()
      .size([treeHeight, treeWidth])
      .separation((a, b) => a.parent === b.parent ? 1 : 1.4);
    this.treeLayout(root);

    this._draw(root);
  }

  _draw(root) {
    const g = this.g;
    const duration = this.duration;
    const self = this;

    // ---- LINKS ----
    const links = g.selectAll('.link-path')
      .data(root.links(), d => d.target.data.id);

    // Enter
    const linkEnter = links.enter()
      .append('path')
      .attr('class', 'link-path')
      .attr('d', d => {
        const srcW = self._nodeWidth(d.source);
        const o = { x: d.source.x, y: d.source.y + srcW };
        return self._linkPath({ source: o, target: o });
      })
      .attr('stroke', d => self._getNodeColor(d.target));

    // Update + Enter
    linkEnter.merge(links)
      .transition()
      .duration(duration)
      .attr('d', d => {
        const srcW = self._nodeWidth(d.source);
        return self._linkPath(d, srcW);
      })
      .attr('stroke', d => self._getNodeColor(d.target));

    // Exit
    links.exit()
      .transition()
      .duration(duration)
      .attr('d', d => {
        const srcW = self._nodeWidth(d.source);
        const o = { x: d.source.x, y: d.source.y + srcW };
        return self._linkPath({ source: o, target: o });
      })
      .remove();

    // ---- NODES ----
    const nodes = g.selectAll('.node-group')
      .data(root.descendants(), d => d.data.id);

    // Enter
    const nodeEnter = nodes.enter()
      .append('g')
      .attr('class', d => `node-group depth-${d.depth}`)
      .attr('transform', d => {
        const parent = d.parent || d;
        return `translate(${parent.y},${parent.x})`;
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        self._toggleNode(d.data);
      })
      .on('mouseenter', (event, d) => self._showTooltip(event, d.data))
      .on('mousemove', (event) => self._moveTooltip(event))
      .on('mouseleave', () => self._hideTooltip());

    // Node rectangle
    nodeEnter.append('rect')
      .attr('class', 'node-rect')
      .attr('width', d => self._nodeWidth(d))
      .attr('height', 34)
      .attr('x', 0)
      .attr('y', -17)
      .attr('fill', d => {
        const color = self._getNodeColor(d);
        return d.depth === 0 ? color : self._adjustAlpha(color, 0.9);
      })
      .attr('stroke', d => self._getNodeColor(d))
      .attr('stroke-width', d => d.depth === 0 ? 2 : 1);

    // Node label
    nodeEnter.append('text')
      .attr('class', d => d.depth === 0 ? 'node-text node-text--root' : 'node-text')
      .attr('x', 12)
      .attr('dy', '0.35em')
      .text(d => self._truncateText(d.data.name, 40));

    // Expand/collapse badge
    nodeEnter.append('text')
      .attr('class', 'node-badge')
      .attr('x', d => self._nodeWidth(d) - 24)
      .attr('dy', '0.35em')
      .text(d => {
        const kids = d.data.children || d.data._children;
        return kids ? kids.length : '';
      });

    // Expand/collapse icon
    nodeEnter.append('text')
      .attr('class', 'node-expand-icon')
      .attr('x', d => self._nodeWidth(d) - 8)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .text(d => {
        if (d.data._children) return '+';
        if (d.data.children && d.data.children.length > 0) return '−';
        return '';
      });

    // Update + Enter position
    const nodeUpdate = nodeEnter.merge(nodes);

    nodeUpdate.transition()
      .duration(duration)
      .attr('transform', d => `translate(${d.y},${d.x})`);

    // Update existing node visuals
    nodeUpdate.select('.node-rect')
      .attr('width', d => self._nodeWidth(d))
      .attr('fill', d => {
        if (self.searchTerm && d.data.name.toLowerCase().includes(self.searchTerm.toLowerCase())) {
          return '#facc15';
        }
        const color = self._getNodeColor(d);
        return d.depth === 0 ? color : self._adjustAlpha(color, 0.9);
      })
      .attr('stroke', d => {
        if (self.searchTerm && d.data.name.toLowerCase().includes(self.searchTerm.toLowerCase())) {
          return '#facc15';
        }
        return self._getNodeColor(d);
      });

    nodeUpdate.select('.node-text')
      .text(d => self._truncateText(d.data.name, 40))
      .attr('fill', d => {
        if (self.searchTerm && d.data.name.toLowerCase().includes(self.searchTerm.toLowerCase())) {
          return '#0a0e1a';
        }
        return '#fff';
      });

    nodeUpdate.select('.node-expand-icon')
      .text(d => {
        if (d.data._children) return '+';
        if (d.data.children && d.data.children.length > 0) return '−';
        return '';
      });

    nodeUpdate.select('.node-badge')
      .text(d => {
        const kids = d.data.children || d.data._children;
        return kids ? kids.length : '';
      });

    // Exit
    const nodeExit = nodes.exit();
    nodeExit.transition()
      .duration(duration)
      .attr('transform', d => {
        const parent = d.parent || d;
        return `translate(${parent.y},${parent.x})`;
      })
      .remove();

    nodeExit.select('rect')
      .transition()
      .duration(duration)
      .attr('width', 0);

    nodeExit.select('text')
      .transition()
      .duration(duration)
      .style('opacity', 0);
  }

  _toggleNode(nodeData) {
    if (nodeData.children) {
      nodeData._children = nodeData.children;
      nodeData.children = null;
    } else if (nodeData._children) {
      nodeData.children = nodeData._children;
      nodeData._children = null;
    }
    this._updateLayout();
  }

  expandAll(node) {
    node = node || this.data;
    if (node._children) {
      node.children = node._children;
      node._children = null;
    }
    if (node.children) {
      node.children.forEach(c => this.expandAll(c));
    }
    if (node === this.data) this._updateLayout();
  }

  collapseAll(node, depth) {
    node = node || this.data;
    depth = depth || 0;
    if (node.children) {
      node.children.forEach(c => this.collapseAll(c, depth + 1));
      if (depth >= 1) {
        node._children = node.children;
        node.children = null;
      }
    }
    if (node === this.data) this._updateLayout();
  }

  resetView() {
    this._centerView();
  }

  search(term) {
    this.searchTerm = term;
    if (term) {
      // Expand nodes that contain search matches
      this._expandForSearch(this.data, term.toLowerCase());
    }
    this._updateLayout();
  }

  _expandForSearch(node, term) {
    let found = node.name.toLowerCase().includes(term);

    const allChildren = node.children || node._children || [];
    for (const child of allChildren) {
      if (this._expandForSearch(child, term)) {
        found = true;
      }
    }

    if (found && node._children) {
      node.children = node._children;
      node._children = null;
    }

    return found;
  }

  _centerView() {
    const svgEl = this.svg.node();
    const { width, height } = svgEl.getBoundingClientRect();

    const transform = d3.zoomIdentity
      .translate(80, height / 2)
      .scale(0.8);

    this.svg.transition()
      .duration(this.duration)
      .call(this.zoom.transform, transform);
  }

  zoomIn() {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.3);
  }

  zoomOut() {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 0.7);
  }

  _linkPath(d, srcWidth) {
    srcWidth = srcWidth || 0;
    const sy = d.source.y + srcWidth;
    return `M${sy},${d.source.x}
            C${(sy + d.target.y) / 2},${d.source.x}
             ${(sy + d.target.y) / 2},${d.target.x}
             ${d.target.y},${d.target.x}`;
  }

  _nodeWidth(d) {
    const textLen = d.data.name.length;
    const base = d.depth === 0 ? 18 : 13;
    const charW = d.depth === 0 ? 9 : 7.2;
    const displayLen = Math.min(textLen, 40);
    const badgeW = (d.data.children || d.data._children) ? 32 : 8;
    return Math.max(displayLen * charW + 24 + badgeW, 100);
  }

  _truncateText(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen - 1) + '…';
  }

  _adjustAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /** Get which top-level branch index a node belongs to */
  _getBranchIndex(d) {
    if (d.depth === 0) return -1;
    let node = d;
    while (node.parent && node.parent.depth > 0) {
      node = node.parent;
    }
    // node is now a direct child of root — find its index among siblings
    if (node.parent) {
      const siblings = node.parent.children || [];
      const idx = siblings.indexOf(node);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  }

  /** Get color for a node based on its branch + depth */
  _getNodeColor(d) {
    if (d.depth === 0) return ROOT_COLOR;
    const branchIdx = this._getBranchIndex(d);
    const palette = BRANCH_PALETTES[branchIdx % BRANCH_PALETTES.length];
    // depth 1 → base, depth 2 → mid, depth 3+ → light
    const shade = Math.min(d.depth - 1, palette.length - 1);
    return palette[shade];
  }

  _showTooltip(event, data) {
    if (!data.description && !this.showDescriptions) return;

    const titleEl = this.tooltip.querySelector('.tooltip__title');
    const bodyEl = this.tooltip.querySelector('.tooltip__body');

    titleEl.textContent = data.name;
    bodyEl.textContent = data.description || '(No description)';

    this.tooltip.classList.add('visible');
    this._moveTooltip(event);
  }

  _moveTooltip(event) {
    const x = event.clientX + 16;
    const y = event.clientY - 8;
    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  }

  _hideTooltip() {
    this.tooltip.classList.remove('visible');
  }

  getStats() {
    let totalNodes = 0;
    let maxDepth = 0;

    const walk = (node, depth) => {
      totalNodes++;
      if (depth > maxDepth) maxDepth = depth;
      const kids = node.children || node._children || [];
      kids.forEach(c => walk(c, depth + 1));
    };

    if (this.data) walk(this.data, 0);
    return { totalNodes, maxDepth };
  }
}
