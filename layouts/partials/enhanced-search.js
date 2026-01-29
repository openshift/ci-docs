// Enhanced search functionality that works with both popover and search page
(function($) {
    'use strict';

    var EnhancedSearch = {
        init: function() {
            $(document).ready(function() {
                // Handle search input in navbar/sidebar
                $(document).on('keypress', '.td-search-input', function(e) {
                    if (e.keyCode === 13) {
                        e.preventDefault();
                        var query = $(this).val().trim();
                        if (query) {
                            // If offline search is enabled, show popover results
                            // Otherwise redirect to search page
                            if ($(this).data('offline-search-index-json-src')) {
                                // Trigger change event to show popover (handled by offline-search.js)
                                $(this).trigger('change');
                            } else {
                                // Redirect to search page
                                var searchPage = "{{ "search/" | absURL }}?q=" + encodeURIComponent(query);
                                window.location.href = searchPage;
                            }
                        }
                        return false;
                    }
                });
                
                // Also handle click on search icon if present
                $(document).on('click', '.td-search-input', function() {
                    var query = $(this).val().trim();
                    if (query && $(this).data('offline-search-index-json-src')) {
                        $(this).trigger('change');
                    }
                });
            });
        }
    };

    EnhancedSearch.init();
}(jQuery));

