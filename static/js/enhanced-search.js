function openEnhancedSearch() {
  document.getElementById('enhanced-search-container').style.display = 'block';
  document.getElementById('enhanced-search-input').focus();
}

function closeEnhancedSearch() {
  document.getElementById('enhanced-search-container').style.display = 'none';
}

function performEnhancedSearch() {
  const query = document.getElementById('enhanced-search-input').value;
  if (!query.trim()) return;
  
  const resultsDiv = document.getElementById('enhanced-search-results');
  const loadingDiv = document.getElementById('enhanced-search-loading');
  
  loadingDiv.style.display = 'block';
  resultsDiv.innerHTML = '';
  
  // Use Fuse.js search with improved performance
  performEnhancedFuseSearch(query, resultsDiv, loadingDiv);
}

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Security: Sanitize search input
function sanitizeSearchInput(text) {
  if (typeof text !== 'string') {
    return '';
  }
  // Remove potentially dangerous characters
  return text.replace(/[<>\"']/g, '').substring(0, 200);
}

// Security: Sanitize URLs to prevent XSS
function sanitizeUrl(url) {
  try {
    // Only allow relative URLs or same origin
    if (url.startsWith('/') || url.startsWith('#')) {
      return url;
    }
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
    return '#';
  } catch {
    return '#';
  }
}

function performEnhancedFuseSearch(query, resultsDiv, loadingDiv) {
  // Fuse.js search - lightweight and fast with fuzzy matching
  // Security: Sanitize query
  const sanitizedQuery = sanitizeSearchInput(query);
  
  // Use Fuse.js if available
  if (window.fuseSearch && window.searchData) {
    try {
      const fuseResults = window.fuseSearch.search(sanitizedQuery, {
        limit: 10
      });
      
      loadingDiv.style.display = 'none';
      
      if (fuseResults.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'alert alert-info';
        noResults.innerHTML = `
          <h4>No results found</h4>
          <p>I did not find information related to "<strong>${escapeHtml(sanitizedQuery)}</strong>".</p>
          <p><strong>Tips:</strong></p>
          <ul>
            <li>Try using different keywords</li>
            <li>Check your spelling</li>
            <li>Use more general terms</li>
            <li>Try searching for phrases in quotes: "cluster profile"</li>
          </ul>
        `;
        resultsDiv.innerHTML = '';
        resultsDiv.appendChild(noResults);
        return;
      }
      
      // Build results list
      const list = document.createElement('ul');
      list.className = 'enhanced-search-results-list';
      
      fuseResults.forEach(result => {
        const doc = result.item;
        const item = document.createElement('li');
        const link = document.createElement('a');
        const safeUrl = sanitizeUrl(doc.ref);
        link.href = safeUrl;
        
        // Use Fuse.js matches for highlighting
        let titleHtml = doc.title || doc.ref;
        if (result.matches && result.matches.length > 0) {
          const titleMatch = result.matches.find(m => m.key === 'title');
          if (titleMatch && titleMatch.indices) {
            titleHtml = highlightFuseMatches(doc.title, titleMatch.indices);
          } else {
            titleHtml = highlightQuery(doc.title, sanitizedQuery);
          }
        } else {
          titleHtml = highlightQuery(doc.title, sanitizedQuery);
        }
        link.innerHTML = titleHtml;
        
        const excerpt = document.createElement('p');
        const excerptText = doc.excerpt || doc.description || '';
        if (excerptText) {
          let excerptHtml = excerptText;
          if (result.matches && result.matches.length > 0) {
            const descMatch = result.matches.find(m => m.key === 'description' || m.key === 'body');
            if (descMatch && descMatch.indices) {
              excerptHtml = highlightFuseMatches(excerptText, descMatch.indices);
            } else {
              excerptHtml = highlightQuery(excerptText, sanitizedQuery);
            }
          } else {
            excerptHtml = highlightQuery(excerptText, sanitizedQuery);
          }
          excerpt.innerHTML = excerptHtml;
          excerpt.className = 'text-muted small';
        }
        
        item.appendChild(link);
        if (excerptText) {
          item.appendChild(excerpt);
        }
        list.appendChild(item);
      });
      
      resultsDiv.innerHTML = '';
      resultsDiv.appendChild(list);
      return;
    } catch (error) {
      console.error('Fuse.js search error:', error);
    }
  } else {
    loadingDiv.style.display = 'none';
    const errorMsg = document.createElement('div');
    errorMsg.className = 'alert alert-warning';
    errorMsg.innerHTML = '<p>Search index not loaded. Please refresh the page.</p>';
    resultsDiv.innerHTML = '';
    resultsDiv.appendChild(errorMsg);
  }
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Security: Initialize event listeners properly
(function() {
  'use strict';
  
  document.addEventListener('DOMContentLoaded', function() {
    const closeBtn = document.getElementById('enhanced-search-close-btn');
    const searchBtn = document.getElementById('enhanced-search-button');
    const searchInput = document.getElementById('enhanced-search-input');
    
    if (closeBtn) {
      closeBtn.addEventListener('click', closeEnhancedSearch);
    }
    
    if (searchBtn) {
      searchBtn.addEventListener('click', performEnhancedSearch);
    }
    
    if (searchInput) {
      // Security: Input validation
      searchInput.addEventListener('input', function(e) {
        if (e.target.value.length > 500) {
          e.target.value = e.target.value.substring(0, 500);
        }
      });
      
      searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          performEnhancedSearch();
        }
      });
    }
    
    // Keyboard shortcut: Ctrl+K or Cmd+K to open enhanced search
    document.addEventListener('keydown', function(e) {
      // Security: Only trigger if not typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openEnhancedSearch();
      }
      if (e.key === 'Escape') {
        closeEnhancedSearch();
      }
    });
  });
})();