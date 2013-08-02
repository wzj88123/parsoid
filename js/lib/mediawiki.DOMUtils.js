"use strict";

/**
 * General DOM utilities
 */

require('./core-upgrade.js');
var Util = require('./mediawiki.Util.js').Util,
	Node = require('./mediawiki.wikitext.constants.js').Node,
	pd = require('./mediawiki.parser.defines.js');

// define some constructor shortcuts
var KV = pd.KV;

var DOMUtils = {
	isElt: function(node) {
		return node.nodeType === Node.ELEMENT_NODE;
	},

	isText: function(node) {
		return node.nodeType === Node.TEXT_NODE;
	},

	isBlockNode: function(node) {
		return node && Util.isBlockTag(node.nodeName.toLowerCase());
	},

	// See http://www.w3.org/html/wg/drafts/html/master/syntax.html#formatting
	formattingTagMap: Util.arrayToHash([
		'A', 'B', 'BIG', 'CODE', 'EM', 'FONT', 'I', 'NOBR',
		'S', 'SMALL', 'STRIKE', 'STRONG', 'TT', 'U'
	]),

	isFormattingElt: function(node) {
		return this.isElt(node) && this.formattingTagMap[node.nodeName];
	},

	/**
	 * Add a type to the typeof attribute. This method works for both tokens
	 * and DOM nodes as it only relies on getAttribute and setAttribute, which
	 * are defined for both.
	 */
	addTypeOf: function(node, type) {
		var typeOf = node.getAttribute('typeof');
		if (typeOf) {
			var types = typeOf.split(' ');
			if (types.indexOf(type) === -1) {
				// not in type set yet, so add it.
				types.push(type);
			}
			node.setAttribute('typeof', types.join(' '));
		} else {
			node.setAttribute('typeof', type);
		}
	},

	/**
	 * Remove a type from the typeof attribute. This method works on both
	 * tokens and DOM nodes as it only relies on
	 * getAttribute/setAttribute/removeAttribute
	 */
	removeTypeOf: function(node, type) {
		var typeOf = node.getAttribute('typeof');
		function notType (t) {
			return t !== type;
		}
		if (typeOf) {
			var types = typeOf.split(' ').filter(notType);

			if (types.length) {
				node.setAttribute('typeof', types.join(''));
			} else {
				node.removeAttribute('typeof');
			}
		}
	},

	// Decode a JSON object into the data member of DOM nodes
	loadDataAttrib: function(node, name, defaultVal) {
		if ( node.nodeType !== node.ELEMENT_NODE ) {
			return;
		}

		if ( ! node.data ) {
			node.data = {};
		}
		if ( node.data[name] === undefined ) {
			node.data[name] = this.getJSONAttribute(node, 'data-' + name, defaultVal);
		}
		// nothing to do if already loaded
	},

	// Save all node.data.* structures to data attributes
	saveDataAttribs: function(node) {
		if ( node.nodeType !== node.ELEMENT_NODE ) {
			return;
		}

		for(var key in node.data) {
			if ( key.match( /^tmp_/ ) !== null ) {
				continue;
			}
			var val = node.data[key];
			if ( val && val.constructor === String ) {
				node.setAttribute('data-' + key, val);
			} else if (val instanceof Object) {
				this.setJSONAttribute(node, 'data-' + key, val);
			}
			// Else: throw error?
		}
	},

	// Decode data-parsoid into node.data.parsoid
	loadDataParsoid: function(node) {
		this.loadDataAttrib(node, 'parsoid', {});
	},

	getDataParsoid: function ( n ) {
		if ( ! ( n.data && n.data.parsoid ) ) {
			this.loadDataParsoid( n );
		}
		return n.data.parsoid;
	},

	getDataMw: function ( n ) {
		if ( ! ( n.data && n.data.mw ) ) {
			this.loadDataAttrib( n, 'mw', {} );
		}
		return n.data.mw;
	},

	setDataParsoid: function(n, dpObj) {
		n.setAttribute("data-parsoid", JSON.stringify(dpObj));
		return n;
	},

	getJSONAttribute: function(n, name, defaultVal) {
		if ( n.nodeType !== n.ELEMENT_NODE ) {
			return defaultVal !== undefined ? defaultVal : {};
		}

		var attVal = n.getAttribute(name);
		if (!attVal) {
			return defaultVal !== undefined ? defaultVal : {};
		}
		try {
			return JSON.parse(attVal);
		} catch(e) {
			console.warn('ERROR: Could not decode attribute-val ' + attVal +
					' for ' + name + ' on node ' + n.outerHTML);
			return defaultVal !== undefined ? defaultVal : {};
		}
	},

	setJSONAttribute: function(n, name, obj) {
		n.setAttribute(name, JSON.stringify(obj));
	},

	getAttributeShadowInfo: function ( node, name, tplAttrs ) {
		this.getDataParsoid( node );
		if ( node.nodeType !== node.ELEMENT_NODE ||
				!node.data || !node.data.parsoid ) {
			return node.getAttribute( name );
		}
		var curVal = node.getAttribute(name),
			dp = node.data.parsoid;

		// If tplAttrs is truish, check if this attribute was
		// template-generated. Return that value if set.
		if ( tplAttrs ) {
			var type = node.getAttribute('typeof'),
				about = node.getAttribute('about') || '',
				tplAttrState = tplAttrs[about];
			if (type && type.match(/\bmw:ExpandedAttrs\/[^\s]+/) &&
					tplAttrState &&
					tplAttrState.vs[name] )
			{
				return {
					value: tplAttrState.vs[name],
					modified: false,
					fromsrc: true
				};
			}
		}

		// Not the case, continue regular round-trip information.
		if ( dp.a === undefined ) {
			return {
				value: curVal,
				// Mark as modified if a new element
				modified: !node.hasAttribute('data-parsoid'),
				fromsrc: false
			};
		} else if ( dp.a[name] !== curVal ) {
			//console.log(name, node.getAttribute(name), node.attributes.name.value);
			//console.log(
			//		node.outerHTML, name, JSON.stringify([curVal, dp.a[name]]));
			return {
				value: curVal,
				modified: true,
				fromsrc: false
			};
		} else if ( dp.sa === undefined ) {
			return {
				value: curVal,
				modified: false,
				fromsrc: false
			};
		} else {
			return {
				value: dp.sa[name],
				modified: false,
				fromsrc: true
			};
		}
	},

	getAttributeKVArray: function(node) {
		var attribs = node.attributes,
			kvs = [];
		for(var i = 0, l = attribs.length; i < l; i++) {
			var attrib = attribs.item(i);
			kvs.push(new KV(attrib.name, attrib.value));
		}
		return kvs;
	},



	// Build path from n ---> ancestor
	// Doesn't include ancestor in the path itself
	pathToAncestor: function (n, ancestor) {
		var path = [];
		while (n && n !== ancestor) {
			path.push(n);
			n = n.parentNode;
		}

		return path;
	},

	pathToRoot: function(n) {
		return this.pathToAncestor(n, null);
	},

	// Build path from n ---> sibling (default)
	// If left is true, will build from sibling ---> n
	// Doesn't include sibling in the path in either case
	pathToSibling: function(n, sibling, left) {
		var path = [];
		while (n && n !== sibling) {
			path.push(n);
			n = left ? n.previousSibling : n.nextSibling;
		}

		return path;
	},

	// Does 'n1' occur before 'n2 in their parent's children list?
	inSiblingOrder: function(n1, n2) {
		while (n1 && n1 !== n2) {
			n1 = n1.nextSibling;
		}
		return n1 !== null;
	},

	// Is 'n1' an ancestor of 'n2' in the DOM?
	isAncestorOf: function (n1, n2) {
		while (n2 && n2 !== n1) {
			n2 = n2.parentNode;
		}
		return n2 !== null;
	},

	hasNodeName: function(n, name) {
		return n.nodeName.toLowerCase() === name;
	},

	isNodeOfType: function(n, name, type) {
		return this.hasNodeName(n, name) && n.getAttribute("typeof") === type;
	},

	isMarkerMeta: function(n, type) {
		return this.isNodeOfType(n, "meta", type);
	},

	isTplMetaType: function(nType)  {
		return nType && nType.match(/\bmw:Transclusion(\/[^\s]+)*\b/);
	},

	isExpandedAttrsMetaType: function(nType) {
		return nType && nType.match(/\bmw:ExpandedAttrs(\/[^\s]+)*\b/);
	},

	isTplMarkerMeta: function(n)  {
		return (
			this.hasNodeName(n, "meta") &&
			this.isTplMetaType(n.getAttribute("typeof"))
		);
	},

	isTplStartMarkerMeta: function(n)  {
		if (this.hasNodeName(n, "meta")) {
			var t = n.getAttribute("typeof");
			var tMatch = t && t.match(/\bmw:Transclusion(\/[^\s]+)*\b/);
			return tMatch && !t.match(/\/End\b/);
		} else {
			return false;
		}
	},

	isTplEndMarkerMeta: function(n)  {
		if (this.hasNodeName(n, "meta")) {
			var t = n.getAttribute("typeof");
			return t && t.match(/\bmw:Transclusion(\/[^\s]+)*\/End\b/);
		} else {
			return false;
		}
	},

	hasLiteralHTMLMarker: function(dp) {
		return dp.stx === 'html';
	},

	isNewElt: function(n) {
		return n.getAttribute('data-parsoid') === null;
	},

	isLiteralHTMLNode: function(n) {
		return (n &&
			this.isElt(n) &&
			this.hasLiteralHTMLMarker(this.getDataParsoid(n)));
	},

	isIndentPre: function(n) {
		return this.hasNodeName(n, "pre") && !this.isLiteralHTMLNode(n);
	},

	isFosterablePosition: function(n) {
		return n && n.parentNode.nodeName in {TABLE:1, TBODY:1, TR:1};
	},

	isList: function(n) {
		return n && n.nodeName in {OL:1, UL:1, DL:1};
	},

	isListElt: function(n) {
		return n && n.nodeName in {LI:1, DD:1, DT:1};
	},

	isListOrListElt: function(n) {
		return n && n.nodeName in {OL:1, UL:1, DL:1, LI:1, DT:1, DD:1};
	},

	getPrecedingElementSibling: function(node) {
		var sibling = node.previousSibling;
		while (sibling) {
			if (sibling.nodeType === node.ELEMENT_NODE) {
				return sibling;
			}
			sibling = node.previousSibling;
		}
		return null;
	},

	hasElementChild: function(node) {
		var children = node.childNodes;
		for (var i = 0, n = children.length; i < n; i++) {
			if (this.isElt(children[i])) {
				return true;
			}
		}

		return false;
	},

	/**
	 * Check if a node has a block-level element descendant
	 */
	hasBlockElementDescendant: function(node) {
		var children = node.childNodes;
		for (var i = 0, n = children.length; i < n; i++) {
			var child = children[i];
			if (child.nodeType === child.ELEMENT_NODE &&
					// Is a block-level node
					( this.isBlockNode(child) ||
					  // or has a block-level child or grandchild or..
					  this.hasBlockElementDescendant(child) ) )
			{
				return true;
			}
		}

		return false;
	},

	indentPreDSRCorrection: function(textNode) {
		// NOTE: This assumes a text-node and doesn't check that it is one.
		//
		// FIXME: Doesn't handle text nodes that are not direct children of the pre
		if (this.isIndentPre(textNode.parentNode)) {
			var numNLs;
			if (textNode.parentNode.lastChild === textNode) {
				// We dont want the trailing newline of the last child of the pre
				// to contribute a pre-correction since it doesn't add new content
				// in the pre-node after the text
				numNLs = (textNode.nodeValue.match(/\n./g)||[]).length;
			} else {
				numNLs = (textNode.nodeValue.match(/\n/g)||[]).length;
			}
			return numNLs;
		} else {
			return 0;
		}
	},

	// Check if node is an ELEMENT node belongs to a template/extension.
	//
	// NOTE: Use with caution. This technique works reliably for the
	// root level elements of tpl-content DOM subtrees since only they
	// are guaranteed to be  marked and nested content might not
	// necessarily be marked.
	isTplElementNode: function(env, node) {
		if (this.isElt(node)) {
			var about = node.getAttribute('about');
			return about && env.isParsoidObjectId(about);
		} else {
			return false;
		}
	},

	convertDOMtoTokens: function(tokBuf, node) {
		function domAttrsToTagAttrs(attrs) {
			var out = [], dp;
			for (var i = 0, n = attrs.length; i < n; i++) {
				var a = attrs.item(i);
				if (a.name === "data-parsoid") {
					dp = JSON.parse(a.value);
				} else {
					out.push(new KV(a.name, a.value));
				}
			}
			return { attrs: out, dataAttrs: dp };
		}

		switch(node.nodeType) {
			case Node.ELEMENT_NODE:
				var nodeName = node.nodeName.toLowerCase(),
					children = node.childNodes,
					attrInfo = domAttrsToTagAttrs(node.attributes);

				if (Util.isVoidElement(nodeName)) {
					tokBuf.push(new pd.SelfclosingTagTk(nodeName, attrInfo.attrs, attrInfo.dataAttrs));
				} else {
					tokBuf.push(new pd.TagTk(nodeName, attrInfo.attrs, attrInfo.dataAttrs));
					for (var i = 0, n = children.length; i < n; i++) {
						tokBuf = this.convertDOMtoTokens(tokBuf, children[i]);
					}
					tokBuf.push(new pd.EndTagTk(nodeName));
				}
				break;

			case Node.TEXT_NODE:
				tokBuf = tokBuf.concat(Util.newlinesToNlTks(node.nodeValue));
				break;

			case Node.COMMENT_NODE:
				tokBuf.push(new pd.CommentTk(node.nodeValue));
				break;

			default:
				console.warn( "Unhandled node type: " + node.outerHTML );
				break;
		}
		return tokBuf;
	},

	currentDiffMark: function(node, env) {
		if (!node || !this.isElt(node)) {
			return false;
		}
		if ( !( node.data && node.data["parsoid-diff"] ) ) {
			this.loadDataAttrib(node, "parsoid-diff");
		}
		var dpd = node.data["parsoid-diff"];
		return dpd !== {} && dpd.id === env.page.id ? dpd : null;
	},

	hasCurrentDiffMark: function(node, env) {
		return this.currentDiffMark(node, env) !== null;
	},

	onlySubtreeChanged: function(node, env) {
		var dmark = this.currentDiffMark(node, env);
		return dmark && dmark.diff.length === 1 && dmark.diff[0] === 'subtree-changed';
	},

	directChildrenChanged: function(node, env) {
		var dmark = this.currentDiffMark(node, env);
		return dmark && dmark.diff.indexOf('children-changed') !== -1;
	},

	hasInsertedOrModifiedDiffMark: function(node, env) {
		var diffMark = this.currentDiffMark(node, env);
		return diffMark &&
			(diffMark.diff.indexOf('modified') >= 0 ||
			 diffMark.diff.indexOf('inserted') >= 0);
	},

	setDiffMark: function(node, env, change) {
		var dpd = this.getJSONAttribute(node, 'data-parsoid-diff', null);
		if (dpd !== null && dpd.id === env.page.id) {
			// Diff is up to date, append this change
			dpd.diff.push(change);
		} else {
			// Was an old diff entry or no diff at all, reset
			dpd = {
				// The base page revision this change happened on
				id: env.page.id,
				diff: [change]
			};
		}

		// Add serialization info to this node
		this.setJSONAttribute(node, 'data-parsoid-diff', dpd);
	},

	/**
	 * Is a node representing inter-element ws?
	 */
	isIEW: function (node) {
		// ws-only
		return this.isText(node) && node.nodeValue.match(/^\s*$/);
	},

	isContentNode: function(node) {
		return node.nodeType !== node.COMMENT_NODE &&
			!this.isIEW(node) &&
			!this.isMarkerMeta(node, "mw:DiffMarker");
	},

	/**
	 * Check if an element is a HTML element.
	 */
	isHtmlElement: function (node) {
		return Util.isHTMLElementName(node.nodeName);
	},

	/**
	 * Get the first child element or non-IEW text node, ignoring
	 * whitespace-only text nodes and comments.
	 */
	firstNonSepChildNode: function(node) {
		var child = node.firstChild;
		while (child && !this.isContentNode(child)) {
			child = child.nextSibling;
		}
		return child;
	},

	previousNonSepSibling: function (node) {
		var prev = node.previousSibling;
		while (prev && !this.isContentNode(prev)) {
			prev = prev.previousSibling;
		}
		return prev;
	},

	nextNonSepSibling: function (node) {
		var next = node.nextSibling;
		while (next && !this.isContentNode(next)) {
			next = next.nextSibling;
		}
		return next;
	},

	/**
	 * Are all children of this node text nodes?
	 */
	allChildrenAreText: function (node) {
		var child = node.firstChild;
		while(child) {
			if(child.nodeType !== node.TEXT_NODE) {
				return false;
			}
			child = child.nextSibling;
		}
		return true;
	},

	wrapTextInTypedSpan: function(node, type) {
		var wrapperSpanNode = node.ownerDocument.createElement('span');
		wrapperSpanNode.setAttribute('typeof', type);
		// insert the span
		node.parentNode.insertBefore(wrapperSpanNode, node);
		// move the node into the wrapper span
		wrapperSpanNode.appendChild(node);
		return wrapperSpanNode;
	},


	prependTypedMeta: function(node, type) {
		var meta = node.ownerDocument.createElement('meta');
		meta.setAttribute('typeof', type);
		node.parentNode.insertBefore(meta, node);
		return meta;
	},

	// Create a TagTk corresponding to a DOM node
	mkTagTk: function (node) {
		var attribKVs = this.getAttributeKVArray(node);
		return new pd.TagTk(node.nodeName.toLowerCase(), attribKVs, node.data.parsoid);
	},

	// Create a EndTagTk corresponding to a DOM node
	mkEndTagTk: function (node) {
		var attribKVs = this.getAttributeKVArray(node);
		return new pd.EndTagTk(node.nodeName.toLowerCase(), attribKVs, node.data.parsoid);
	},

	addAttributes: function(elt, attrs) {
		Object.keys(attrs).forEach(function(k) {
			if (attrs[k] !== null && attrs[k] !== undefined) {
				elt.setAttribute(k, attrs[k]);
			}
		});
	},

	/**
	 * @param {Element} ele
	 * @param {string} someClass
	 * @returns {boolean}
	 */
	hasClass: function ( ele, someClass ) {
		if ( !ele || ele.nodeType !== ele.ELEMENT_NODE ) {
			return false;
		}

		var classes = ele.getAttribute( 'class' );

		if ( classes && classes.match( new RegExp( '\\b' + someClass + '\\b' ) ) ) {
			return true;
		} else {
			return false;
		}
	},

	hasBlockContent: function(node) {
		var child = node.firstChild;
		while (child) {
			if (this.isBlockNode(child)) {
				return true;
			}
			child = child.nextSibling;
		}

		return false;
	},

	migrateChildren: function(from, to) {
		var child = from.firstChild;
		while (child) {
			var next = child.nextSibling;
			to.appendChild(child);
			child = next;
		}
	},

	/**
	 * Gets all siblings that follow 'node' that have an 'about' as their about id.
	 *
	 * This is used to fetch transclusion/extension content by using the about-id
	 * as the key.  This works because transclusion/extension content is a forest
	 * of dom-trees formed by adjacent dom-nodes.  This is the contract that
	 * templace encapsulation, dom-reuse, and VE code all have to abide by.
	 *
	 * The only exception to this adjacency rule is IEW nodes in fosterable
	 * positions (in tables) which are not span-wrapped to prevent them from getting
	 * fostered out.
	 **/
	getAboutSiblings: function(node, about) {
		var nodes = [node];

		node = node.nextSibling;
		while (node && (
				this.isElt(node) && node.getAttribute('about') === about ||
				this.isFosterablePosition(node) && !this.isElt(node) && this.isIEW(node)
			))
		{
			nodes.push(node);
			node = node.nextSibling;
		}

		return nodes;
	},

	/**
	 * If 'node' has about-id, it is assumed that it is generated by templates or
	 * extensions.  This function skips over all following content nodes and returns
	 * the first non-template node that follows it.
	 */
	skipOverEncapsulatedContent: function(node) {
		var about = node.getAttribute('about');
		if (!about) {
			return node;
		}

		return this.getAboutSiblings(node, about).last().nextSibling;
	},

	/**
	 * Extract transclusion and extension expansions from a DOM, and return
	 * them in a structure like this:
	 * {
	 *     transclusions: {
	 *         'key1': {
	 *				html: 'html1',
	 *				nodes: [<node1>, <node2>]
	 *			}
	 *     },
	 *     extensions: {
	 *         'key2': {
	 *				html: 'html2',
	 *				nodes: [<node1>, <node2>]
	 *			}
	 *     },
	 *     files: {
	 *         'key3': {
	 *				html: 'html3',
	 *				nodes: [<node1>, <node2>]
	 *			}
	 *     }
	 * }
	 */
	extractExpansions: function (doc) {
		var DU = this;

		var node = doc.body,
			expansion,
			expansions = {
				transclusions: {},
				extensions: {},
				files: {}
			};


		function doExtractExpansions (node) {
			var nodes, expAccum,
				outerHTML = function (n) {
					return n.outerHTML;
				};

			while (node) {
				if (node.nodeType === node.ELEMENT_NODE) {
					var typeOf = node.getAttribute('typeof'),
						about = node.getAttribute('about');
					if ((/\b(?:mw:(?:Transclusion\b|Extension\/))/
								.test(typeOf) && about) ||
							/\b(?:mw:Image(?:\b|\/))/.test(typeOf))
					{
						DU.loadDataParsoid(node);
						nodes = DU.getAboutSiblings(node, about);
						var key;
						if (/\bmw:Transclusion\b/.test(typeOf)) {
							expAccum = expansions.transclusions;
							key = node.data.parsoid.src;
						} else if (/\bmw:Extension\//.test(typeOf)) {
							expAccum = expansions.extensions;
							key = node.data.parsoid.src;
						} else {
							expAccum = expansions.files;
							// XXX gwicke: use proper key that is not
							// source-based? This also needs to work for
							// transclusion output.
							key = node.data.parsoid.cacheKey;
						}

						if (key) {
							expAccum[key] = {
								nodes: nodes,
								html: nodes.map(outerHTML).join('')
							};
						}
						node = nodes.last();
					} else {
						doExtractExpansions(node.firstChild);
					}
				}
				node = node.nextSibling;
			}
		}
		// Kick off the extraction
		doExtractExpansions(doc.body.firstChild);
		return expansions;
	},


	/**
	 * Wrap text and comment nodes in a node list into spans, so that all
	 * top-level nodes are elements.
	 *
	 *
	 * @param array List of DOM nodes to wrap, mix of node types
	 * @return array List of *element* nodes
	 */
	addSpanWrappers: function (nodes) {
		var textCommentAccum = [],
			out = [],
			doc = nodes[0] && nodes[0].ownerDocument;

		function wrapAccum () {
			// Wrap accumulated nodes in a span
			var span = doc.createElement('span'),
				parentNode = textCommentAccum[0].parentNode;
			parentNode.insertBefore(span, textCommentAccum[0]);
			textCommentAccum.forEach( function(n) {
				span.appendChild(n);
			});
			out.push(span);
			textCommentAccum = [];
		}

		nodes.forEach( function(node) {
			if (node.nodeType === node.TEXT_NODE ||
				node.nodeType === node.COMMENT_NODE) {
				textCommentAccum.push(node);
			} else {
				if (textCommentAccum.length) {
					wrapAccum();
				}
				out.push(node);
			}
		});

		if (textCommentAccum.length) {
			wrapAccum();
		}

		return out;
	},

	/**
	 * Get tokens representing a DOM subtree in the token processing stages,
	 * mainly for transclusion and extension processing.
	 */
	getWrapperTokens: function ( nodes ) {
		var DU = this;
		function makeWrapperForNode ( node ) {
			var workNode;
			if (node.nodeType === node.ELEMENT_NODE && node.childNodes.length) {
				// create a copy of the node without children
				workNode = node.ownerDocument.createElement(node.nodeName);
				// copy over attributes
				for (var i = 0; i < node.attributes.length; i++) {
					var attribute = node.attributes.item(i);
					if (attribute.name !== 'typeof') {
						workNode.setAttribute(attribute.name, attribute.value);
					}
				}
				// dataAttribs are not copied over so that we don't inject
				// broken tsr or dsr values. This also lets these tokens pass
				// through the sanitizer as stx.html is not set.
			} else {
				workNode = node;
			}
			var res = [];
			// Now convert our node to tokens
			DU.convertDOMtoTokens(res, workNode);
			return res;
		}

		// XXX: not sure if we have to care about nested block-levels, as
		// those that would break up higher-level inline elements would have
		// broken things up already when building the DOM for the first time.
		//var hasBlockElement = false;
		//for (var i = 0; i < nodes.length; i++) {
		//	if (DU.hasBlockElementDescendant(nodes[i])) {
		//		hasBlockElement = true;
		//		break;
		//	}
		//}

		// First, get two tokens representing the start element
		var tokens = makeWrapperForNode ( nodes[0] );

		var needBlockWrapper = false;
		if (!DU.isBlockNode(nodes[0]) && !DU.isBlockNode(nodes.last())) {
			nodes.forEach(function(n) {
				if (!needBlockWrapper && DU.hasBlockElementDescendant(n)) {
					needBlockWrapper = true;
				}
			});
		}

		if (needBlockWrapper) {
			// Create a block-level wrapper to suppress paragraph
			// wrapping, as the fragment contains a block-level element
			// somewhere further down the tree.
			var blockPlaceholder = nodes[0].ownerDocument.createElement('hr');
			tokens = tokens.concat(makeWrapperForNode(blockPlaceholder));
		} else if (nodes.length > 1) {
			// If we have several siblings, also represent the last sibling.
			tokens = tokens.concat(makeWrapperForNode(nodes.last()));
		}

		// Remove the typeof attribute from the first token. It will be
		// replaced with mw:DOMFragment.
		tokens[0].removeAttribute('typeof');

		return tokens;
	},

	/* Compute, when possible, the wikitext source for a node in
	 * an environment env. Returns null if the source cannot be
	 * extracted.
	 */
	getWTSource: function ( env, node ) {
		var data = node.data.parsoid,
		    dsr = (undefined !== data) ? data.dsr : null;
		return dsr ? env.page.src.substring(dsr[0], dsr[1]) : null;
	}
};



if (typeof module === "object") {
	module.exports.DOMUtils = DOMUtils;
}
