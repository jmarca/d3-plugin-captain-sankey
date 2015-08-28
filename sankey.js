d3.sankey = function() {
 "use strict";
  var sankey = {},
      nodeWidth = 24,
      nodePadding = 8,
      size = [1, 1],
      nodes = [],
      links = [],
      sinksRight = true,
      curvature = 0.5;

  // Accessor-land:
  sankey.curvature = function(x) {
    if (x === undefined) { return curvature; }
    curvature = +x;
    return sankey;
  };

  sankey.nodeWidth = function(x) {
    if (x === undefined) { return nodeWidth; }
    nodeWidth = +x;
    return sankey;
  };

  sankey.nodePadding = function(x) {
    if (x === undefined) { return nodePadding; }
    nodePadding = +x;
    return sankey;
  };

  sankey.nodes = function(x) {
    if (x === undefined) { return nodes; }
    nodes = x;
    return sankey;
  };

  sankey.links = function(x) {
    if (x === undefined) { return links; }
    links = x;
    return sankey;
  };

  sankey.size = function(x) {
    if (x === undefined) { return size; }
    size = x;
    return sankey;
  };

 sankey.sinksRight = function (x) {
    if (x === undefined) { return sinksRight; }
    sinksRight = x;
    return sankey;
 };

  // valueSum: Add up all the 'value' keys from a list of objects (happens a lot):
  function valueSum(nodelist) {
    return d3.sum(nodelist, function(d) { return d.value; });
  }

  // center: Y-position of the middle of a node.
  function center(node) { return node.y + node.dy / 2; }

  // Populate the sourceLinks and targetLinks for each node.
  // Also, if the source and target are not objects, assume they are indices.
  function computeNodeLinks() {
    nodes.forEach(function(node) {
      // Links that have this node as source.
      node.sourceLinks = [];
      // Links that have this node as target.
      node.targetLinks = [];
    });
    links.forEach(function(link) {
      var source = link.source,
          target = link.target;
      if (typeof source === "number") { source = link.source = nodes[link.source]; }
      if (typeof target === "number") { target = link.target = nodes[link.target]; }
      source.sourceLinks.push(link);
      target.targetLinks.push(link);
    });
  }

  // Compute the value (size) of each node by summing the associated links.
  function computeNodeValues() {
    // Each node will equal the greater of the flows coming in or out:
    nodes.forEach(function(node) {
      node.value = Math.max( valueSum(node.sourceLinks), valueSum(node.targetLinks) );
    });
  }

  function moveSourcesRight() {
    nodes.forEach(function(node) {
      if (!node.targetLinks.length) {
        node.x = d3.min(node.sourceLinks, function(d) { return d.target.x; }) - 1;
      }
    });
  }

  function moveSinksRight(x) {
    nodes.forEach(function(node) {
      if (!node.sourceLinks.length) {
        node.x = x - 1;
      }
    });
  }

  function scaleNodeBreadths(kx) {
    nodes.forEach(function(node) {
      node.x *= kx;
    });
  }

  // Compute y-offset of the source endpoint (sy) and target endpoints (ty) of links,
  // relative to the source/target node's y-position.
  function computeLinkDepths() {
    function ascendingSourceDepth(a, b) { return a.source.y - b.source.y; }
    function ascendingTargetDepth(a, b) { return a.target.y - b.target.y; }

    nodes.forEach(function(node) {
      node.sourceLinks.sort(ascendingTargetDepth);
      node.targetLinks.sort(ascendingSourceDepth);
    });
    nodes.forEach(function(node) {
      var sy = 0, ty = 0;
      node.sourceLinks.forEach(function(link) {
        link.sy = sy;
        sy += link.dy;
      });
      node.targetLinks.forEach(function(link) {
        link.ty = ty;
        ty += link.dy;
      });
    });
  }

  // Iteratively assign the breadth (x-position) for each node.
  // Nodes are assigned the maximum breadth of incoming neighbors plus one;
  // nodes with no incoming links are assigned breadth zero, while
  // nodes with no outgoing links are assigned the maximum breadth.
  function computeNodeBreadths() {
    var remainingNodes = nodes,
        nextNodes,
        x = 0;

    function updateNode(node) {
        // Set x-position and width:
        node.x = x;
        node.dx = nodeWidth;
        node.sourceLinks.forEach(function(link) {
          // Only add it to the nextNodes list if it is not already present:
          if (nextNodes.indexOf(link.target) === -1) {
            nextNodes.push(link.target);
          }
        });
    }

    // Work from left to right.
    // Keep updating the breadth (x-position) of nodes that are targets of
    // recently-updated nodes.
    while (remainingNodes.length && x < nodes.length) {
      nextNodes = [];
      remainingNodes.forEach(updateNode);
      remainingNodes = nextNodes;
      x += 1;
    }

    // Optionally move pure sinks always to the right.
    if (sinksRight) {
      moveSinksRight(x);
    }

    scaleNodeBreadths((size[0] - nodeWidth) / (x - 1));
  }

  // Compute the depth (y-position) for each node.
  function computeNodeDepths(iterations) {
    var alpha = 1,
        // Group nodes by breadth:
        nodesByBreadth = d3.nest()
        .key(function(d) { return d.x; })
        .sortKeys(d3.ascending)
        .entries(nodes)
        .map(function(d) { return d.values; });

    function initializeNodeDepth() {
      // Calculate vertical scaling factor.
      var ky = d3.min(nodesByBreadth, function(nodes) {
        return (size[1] - (nodes.length - 1) * nodePadding) / valueSum(nodes);
      });

      nodesByBreadth.forEach(function(nodes) {
        nodes.forEach(function(node, i) {
          node.y = i;
          node.dy = node.value * ky;
        });
      });

      links.forEach(function(link) {
        link.dy = link.value * ky;
      });
    }

    function resolveCollisions() {
      nodesByBreadth.forEach(function(nodes) {
        var node,
            dy,
            y0 = 0,
            n = nodes.length,
            i;

        function ascendingDepth(a, b) { return a.y - b.y; }

        // Push any overlapping nodes down.
        nodes.sort(ascendingDepth);
        for (i = 0; i < n; i += 1) {
          node = nodes[i];
          dy = y0 - node.y;
          if (dy > 0) { node.y += dy; }
          y0 = node.y + node.dy + nodePadding;
        }

        // If the bottommost node goes outside the bounds, push it back up.
        dy = y0 - nodePadding - size[1];
        if (dy > 0) {
          y0 = node.y -= dy;

          // Push any overlapping nodes back up.
          for (i = n - 2; i >= 0; i -= 1) {
            node = nodes[i];
            dy = node.y + node.dy + nodePadding - y0;
            if (dy > 0) { node.y -= dy; }
            y0 = node.y;
          }
        }
      });
    }

    function relaxLeftToRight(alpha) {
      function weightedSource(link) {
        return (link.source.y + link.sy + link.dy / 2) * link.value;
      }

      nodesByBreadth.forEach(function(nodes) {
        nodes.forEach(function(node) {
          if (node.targetLinks.length) {
            // Value-weighted average of the y-position of source node centers linked to this node.
            var y = d3.sum(node.targetLinks, weightedSource) / valueSum(node.targetLinks);
            node.y += (y - center(node)) * alpha;
          }
        });
      });
    }

    function relaxRightToLeft(alpha) {
      function weightedTarget(link) {
        return (link.target.y + link.ty + link.dy / 2) * link.value;
      }

      nodesByBreadth.slice().reverse().forEach(function(nodes) {
        nodes.forEach(function(node) {
          if (node.sourceLinks.length) {
            // Value-weighted average of the y-positions of target nodes linked to this node.
            var y = d3.sum(node.sourceLinks, weightedTarget) / valueSum(node.sourceLinks);
            node.y += (y - center(node)) * alpha;
          }
        });
      });
    }

    //
    initializeNodeDepth();
    resolveCollisions();
    computeLinkDepths();

    while (iterations > 0) {
      iterations -= 1;

      // Make each round of moves progressively weaker:
      alpha *= 0.99;
      relaxRightToLeft(alpha);
      resolveCollisions();
      computeLinkDepths();

      relaxLeftToRight(alpha);
      resolveCollisions();
      computeLinkDepths();
    }
  }

  // SVG path data generator, to be used as "d" attribute on "path" element selection.
  sankey.link = function() {
    function link(d) {
      var x0 = d.source.x + d.source.dx,
          x1 = d.target.x,
          xi = d3.interpolateNumber(x0, x1),
          // pick two points given the curvature and its converse:
          x2 = xi(curvature),
          x3 = xi(1 - curvature),
          y0 = d.source.y + d.sy + d.dy / 2,
          y1 = d.target.y + d.ty + d.dy / 2;
      return "M" + x0 + "," + y0
           + "C" + x2 + "," + y0
           + " " + x3 + "," + y1
           + " " + x1 + "," + y1;
    }

    return link;
  };

  sankey.layout = function(iterations) {
    computeNodeLinks();
    computeNodeValues();
    computeNodeBreadths();
    computeNodeDepths(iterations);
    return sankey;
  };

  sankey.relayout = function() {
    computeLinkDepths();
    return sankey;
  };

  return sankey;
};
