import urllib.request, json, base64

GITHUB_TOKEN = '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'
REPO = 'nicknnn-web/auyologic-geo-w'

content = """name: Build and Push Docker Image

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'

jobs:
  build-backend:
    runs-on: ubuntu-latest

    defaults:
      run:
        working-directory: backend

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push backend image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: nicknnndocker/auyologic-geo-backend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
"""

encoded = base64.b64encode(content.encode('utf-8')).decode()

# Check if file exists first
req = urllib.request.Request(
    'https://api.github.com/repos/' + REPO + '/contents/.github/workflows/docker-backend.yml',
    headers={'Authorization': 'token ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json'}
)
try:
    resp = urllib.request.urlopen(req, timeout=10)
    existing = json.loads(resp.read())
    sha = existing.get('sha')
    print('File exists, SHA:', sha)
    method = 'PUT'
    data_body = {'message': 'Add Docker build workflow for backend', 'content': encoded, 'sha': sha, 'branch': 'main'}
except urllib.error.HTTPError as e:
    if e.code == 404:
        sha = None
        print('File does not exist, creating new')
        method = 'PUT'
        data_body = {'message': 'Add Docker build workflow for backend', 'content': encoded, 'branch': 'main'}
    else:
        print('Error:', e.code)
        exit(1)

data = json.dumps(data_body).encode()
req = urllib.request.Request(
    'https://api.github.com/repos/' + REPO + '/contents/.github/workflows/docker-backend.yml',
    data=data,
    headers={
        'Authorization': 'token ' + GITHUB_TOKEN,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
    }
)
req.get_method = lambda: method

try:
    resp = urllib.request.urlopen(req, timeout=10)
    result = json.loads(resp.read())
    print('Done! Path:', result.get('content', {}).get('path'))
except urllib.error.HTTPError as e:
    print('Error:', e.code, e.read().decode())
