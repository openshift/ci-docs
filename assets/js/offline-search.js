// Enhanced offline search with improved indexing and search capabilities
// Adapted from themes/docsy/assets/js/offline-search.js with enhancements

(function ($) {
    'use strict';

    $(document).ready(function () {
        const $searchInput = $('.td-search-input');

        // Options for popover
        $searchInput.data('html', true);
        $searchInput.data('placement', 'bottom');
        $searchInput.data(
            'template',
            '<div class="popover offline-search-result" role="tooltip"><div class="arrow"></div><h3 class="popover-header"></h3><div class="popover-body"></div></div>'
        );

        // Register handler for change events (shows popover for quick preview)
        $searchInput.on('change', (event) => {
            // Only show popover if not on search page and input has value
            const isSearchPage = window.location.pathname.includes('/search');
            if (!isSearchPage && $(event.target).val().trim()) {
                render($(event.target));
                $searchInput.blur();
            }
        });

        // Handle Enter key - redirect to search page (like original docs.ci behavior)
        // But skip if we're already on the search page
        $searchInput.on('keypress', function(e) {
            const isSearchPage = window.location.pathname.includes('/search');
            // Don't interfere with search page input
            if (isSearchPage && $(this).attr('id') === 'search-page-input') {
                return true; // Let search page handle it
            }
            
            if (e.keyCode === 13 || e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const query = $(this).val().trim();
                if (query) {
                    // Redirect to search page with query
                    const searchPage = '/search/?q=' + encodeURIComponent(query);
                    window.location.href = searchPage;
                }
                return false;
            }
        });

        // Prevent form submission, redirect to search page instead
        // But skip if we're on the search page
        $searchInput.closest('form').on('submit', (e) => {
            const isSearchPage = window.location.pathname.includes('/search');
            if (isSearchPage && $searchInput.attr('id') === 'search-page-input') {
                return true; // Let search page handle it
            }
            
            e.preventDefault();
            e.stopPropagation();
            const query = $searchInput.val().trim();
            if (query) {
                const searchPage = '/search/?q=' + encodeURIComponent(query);
                window.location.href = searchPage;
            }
            return false;
        });

        // Fuse.js search index - lightweight and fast
        let fuse = null;
        let searchData = [];

        // Load search index
        $.ajax($searchInput.data('offline-search-index-json-src')).then(
            (data) => {
                if (!data || data.length === 0) {
                    console.warn('Search index is empty');
                    return;
                }
                
                // Check if Fuse.js is loaded
                if (typeof Fuse === 'undefined') {
                    console.error('Fuse.js is not loaded. Please check the script tag in head.html');
                    return;
                }
                
                // Store search data
                searchData = data;
                
                // Configure Fuse.js with enhanced options
                const fuseOptions = {
                    keys: [
                        { name: 'title', weight: 0.4 },
                        { name: 'description', weight: 0.3 },
                        { name: 'body', weight: 0.1 },
                        { name: 'headings', weight: 0.2 },
                        { name: 'code', weight: 0.15 },
                        { name: 'commands', weight: 0.15 },
                        { name: 'keywords', weight: 0.2 },
                        { name: 'categories', weight: 0.15 },
                        { name: 'tags', weight: 0.15 },
                        { name: 'section', weight: 0.1 },
                        { name: 'allText', weight: 0.05 }
                    ],
                    threshold: 0.3, // 0.0 = perfect match, 1.0 = match anything
                    includeScore: true,
                    includeMatches: true, // For highlighting
                    minMatchCharLength: 2,
                    ignoreLocation: true, // Search anywhere in text
                    findAllMatches: true,
                    useExtendedSearch: true, // Enable advanced queries
                    shouldSort: true,
                    getFn: (obj, path) => {
                        // Ensure path is a string
                        if (typeof path !== 'string') {
                            return '';
                        }
                        
                        // Handle nested paths and arrays
                        const keys = path.split('.');
                        let value = obj;
                        for (let key of keys) {
                            if (value && typeof value === 'object' && value !== null) {
                                value = value[key];
                            } else {
                                break;
                            }
                        }
                        
                        // Handle arrays - join them
                        if (Array.isArray(value)) {
                            return value.join(' ');
                        }
                        
                        // Convert to string if not already
                        if (value === null || value === undefined) {
                            return '';
                        }
                        
                        return String(value);
                    }
                };
                
                // Initialize Fuse.js
                try {
                    fuse = new Fuse(data, fuseOptions);
                    
                    // Expose search index globally for enhanced search
                    window.fuseSearch = fuse;
                    window.searchData = searchData;
                    window.searchIndexBaseHref = $searchInput.data('offline-search-base-href') || '/';

                    $searchInput.trigger('change');
                } catch (error) {
                    console.error('Failed to initialize Fuse.js:', error);
                }
            }
        ).catch(function(error) {
            console.error('Failed to load search index:', error);
        });

        const render = ($targetSearchInput) => {
            // Dispose the previous result
            $targetSearchInput.popover('dispose');

            if (fuse === null) {
                console.warn('Fuse.js index not initialized yet. Search index may still be loading.');
                return;
            }

            const searchQuery = $targetSearchInput.val();
            if (searchQuery === '') {
                return;
            }

            // Fuse.js search - fast and lightweight with fuzzy matching
            let results = [];
            try {
                if (typeof Fuse === 'undefined') {
                    console.error('Fuse.js library not loaded');
                    return;
                }
                
                const fuseResults = fuse.search(searchQuery, {
                    limit: $targetSearchInput.data('offline-search-max-results') || 10
                });
                
                // Convert Fuse.js results to our format
                results = fuseResults.map(result => ({
                    ref: result.item.ref,
                    score: result.score,
                    matches: result.matches || [],
                    item: result.item
                }));
            } catch (error) {
                console.error('Search query error:', error);
                results = [];
            }

            // Build result HTML
            const $html = $('<div>');

            $html.append(
                $('<div>')
                    .css({
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '1em',
                    })
                    .append(
                        $('<span>')
                            .text(`Found ${results.length} result${results.length !== 1 ? 's' : ''}`)
                            .css({ fontWeight: 'bold' })
                    )
                    .append(
                        $('<i>')
                            .addClass('fas fa-times search-result-close-button')
                            .css({ cursor: 'pointer' })
                    )
            );

            const $searchResultBody = $('<div>').css({
                maxHeight: `calc(100vh - ${
                    $targetSearchInput.offset().top -
                    $(window).scrollTop() +
                    180
                }px)`,
                overflowY: 'auto',
            });
            $html.append($searchResultBody);

            if (results.length === 0) {
                $searchResultBody.append(
                    $('<p>').text(`No results found for "${searchQuery}"`)
                );
            } else {
                results.forEach((r) => {
                    const doc = r.item;
                    const href =
                        $searchInput.data('offline-search-base-href') +
                        r.ref.replace(/^\//, '');

                    const $entry = $('<div>').addClass('mt-4');

                    // Show path/section with badge
                    const pathParts = r.ref.split('/').filter(p => p).slice(0, 3);
                    $entry.append(
                        $('<small>')
                            .addClass('d-block text-muted mb-1')
                            .html('<span class="badge badge-light">' + pathParts.join(' / ') + '</span>')
                    );

                    // Title with link - use Fuse.js matches for better highlighting
                    let titleHtml = doc.title || r.ref;
                    if (r.matches && r.matches.length > 0) {
                        const titleMatch = r.matches.find(m => m.key === 'title');
                        if (titleMatch && titleMatch.indices && titleMatch.indices.length > 0) {
                            titleHtml = highlightFuseMatches(doc.title, titleMatch.indices);
                        } else {
                            titleHtml = highlightQuery(doc.title, searchQuery);
                        }
                    } else {
                        titleHtml = highlightQuery(doc.title, searchQuery);
                    }
                    
                    $entry.append(
                        $('<a>')
                            .addClass('d-block')
                            .css({ fontSize: '1.2rem', fontWeight: 'bold', color: '#30638E' })
                            .attr('href', href)
                            .html(titleHtml)
                    );

                    // Description/excerpt - use Fuse.js matches for better highlighting
                    const excerpt = doc.excerpt || doc.description || '';
                    if (excerpt) {
                        let excerptHtml = excerpt;
                        if (r.matches && r.matches.length > 0) {
                            const descMatch = r.matches.find(m => m.key === 'description' || m.key === 'body');
                            if (descMatch && descMatch.indices && descMatch.indices.length > 0) {
                                excerptHtml = highlightFuseMatches(excerpt, descMatch.indices);
                            } else {
                                excerptHtml = highlightQuery(excerpt, searchQuery);
                            }
                        } else {
                            excerptHtml = highlightQuery(excerpt, searchQuery);
                        }
                        $entry.append($('<p>').addClass('text-muted small').html(excerptHtml));
                    }

                    // Tags/categories
                    if (doc.tags && doc.tags.length > 0) {
                        const $tags = $('<div>').addClass('mt-2');
                        doc.tags.forEach(tag => {
                            $tags.append(
                                $('<span>')
                                    .addClass('badge badge-secondary mr-1')
                                    .text(tag)
                            );
                        });
                        $entry.append($tags);
                    }

                    $searchResultBody.append($entry);
                });
            }
            
            // Helper function to highlight Fuse.js match indices
            function highlightFuseMatches(text, indices) {
                if (!text || !indices || indices.length === 0) return text;
                const escapedText = $('<div>').text(text).html();
                let highlighted = escapedText;
                // Sort indices by start position (descending) to avoid offset issues
                const sortedIndices = indices.slice().sort((a, b) => b[0] - a[0]);
                sortedIndices.forEach(([start, end]) => {
                    const before = highlighted.substring(0, start);
                    const match = highlighted.substring(start, end + 1);
                    const after = highlighted.substring(end + 1);
                    highlighted = before + '<mark>' + match + '</mark>' + after;
                });
                return highlighted;
            }

            $targetSearchInput.on('shown.bs.popover', () => {
                $('.search-result-close-button').on('click', () => {
                    $targetSearchInput.val('');
                    $targetSearchInput.trigger('change');
                });
            });

            $targetSearchInput
                .data('content', $html[0].outerHTML)
                .popover('show');
        };
    });
})(jQuery);

