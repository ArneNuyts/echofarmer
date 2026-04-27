#!/usr/bin/env python3
"""
Simple HTTP server with CORS proxy for Bandsintown API.
Serves static files and proxies API requests to bypass CORS restrictions.
"""

import http.server
import socketserver
import json
import urllib.request
import urllib.error
from urllib.parse import urlparse, parse_qs
import os

PORT = 8000
BANDSINTOWN_API = 'https://rest.bandsintown.com'

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        """Add CORS headers to all responses."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-type')
        super().end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        """Handle GET requests - proxy API calls and serve static files."""
        parsed_path = urlparse(self.path)
        
        # Check if this is an API proxy request
        if parsed_path.path == '/api/bandsintown':
            self.handle_bandsintown_proxy(parsed_path)
        else:
            # Serve static files normally
            super().do_GET()

    def handle_bandsintown_proxy(self, parsed_path):
        """Proxy requests to Bandsintown API."""
        try:
            # Get query parameters
            query_params = parse_qs(parsed_path.query)
            endpoint = query_params.get('endpoint', ['/artists/echofarmer/events'])[0]
            # Use widget-style app_id which doesn't require registration
            app_id = query_params.get('app_id', ['js_https://www.bandsintown.com'])[0]
            
            # Build the full API URL (URL-encode app_id since it contains special chars)
            from urllib.parse import quote
            api_url = f'{BANDSINTOWN_API}{endpoint}?app_id={quote(app_id, safe="")}'
            
            # Fetch from Bandsintown API
            req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=5) as response:
                data = response.read()
                content_type = response.headers.get('Content-Type', 'application/json')
            
            # Send response
            self.send_response(200)
            self.send_header('Content-type', content_type)
            self.send_header('Content-Length', len(data))
            self.end_headers()
            self.wfile.write(data)
            
        except urllib.error.URLError as e:
            self.send_error(502, f'Bad Gateway: {str(e)}')
        except Exception as e:
            self.send_error(500, f'Internal Server Error: {str(e)}')

if __name__ == '__main__':
    # Change to the script directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(('', PORT), CORSRequestHandler) as httpd:
        print(f'Server running at http://localhost:{PORT}/')
        print(f'API proxy available at http://localhost:{PORT}/api/bandsintown')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nServer stopped.')
