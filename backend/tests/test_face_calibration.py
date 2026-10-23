"""Real HTTP/database tests isolated from developer credentials and catalog rows.
Run: python -m unittest discover -s tests -v (from backend).
"""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

class FaceCalibrationAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.password = secrets.token_urlsafe(32)
        environment = dict(os.environ, DATABASE_URL='sqlite:///' + str(Path(cls.directory.name) / 'test.db'),
                           CORS_ORIGINS='http://localhost:3000', JWT_SECRET=secrets.token_urlsafe(48), ADMIN_EMAIL='face-test@example.com', ADMIN_PASSWORD=cls.password)
        cls.server = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(port)],
                                      cwd=Path(__file__).resolve().parents[1], env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            try:
                cls.request('/health')
                break
            except (OSError, urllib.error.URLError):
                if cls.server.poll() is not None:
                    cls.directory.cleanup()
                    raise RuntimeError('Test API failed to start')
                time.sleep(.05)
        else:
            cls.server.terminate(); cls.server.wait(); cls.directory.cleanup()
            raise RuntimeError('Test API did not become ready')
        cls.token = cls.request('/api/auth/login', {'email': 'face-test@example.com', 'password': cls.password})['access_token']
        cls.store = cls.request('/api/admin/stores', {'name': 'Face Test', 'slug': 'face-test'})

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        try:
            cls.server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.server.kill(); cls.server.wait()
        cls.directory.cleanup()

    @classmethod
    def request(cls, path, data=None, method=None, authenticated=True):
        headers = {'Content-Type': 'application/json'}
        if authenticated and hasattr(cls, 'token'):
            headers['Authorization'] = 'Bearer ' + cls.token
        request = urllib.request.Request(cls.base + path, json.dumps(data).encode() if data is not None else None, headers, method=method)
        with urllib.request.urlopen(request, timeout=5) as response:
            body = response.read()
            return json.loads(body) if body else None

    def product(self, category):
        return self.request('/api/admin/stores/' + self.store['id'] + '/products',
                            {'name': 'Test Jewelry', 'slug': category + '-' + secrets.token_hex(4), 'category': category, 'glb_url': '/models/sample-' + category + '.glb'})

    def test_persists_calibration_for_both_categories(self):
        for category in ('earring', 'necklace'):
            with self.subTest(category=category):
                product = self.product(category)
                calibration = {'height_mm': 40, 'anchor': [.5, 1, .5], 'offset_mm': [1, -2, 3], 'rotation_deg': [0, 20, 0], 'side': 'left', 'ear_anchor': 'auto'}
                self.request('/api/admin/products/' + product['id'] + '/face-calibration', calibration, 'PUT')
                public = self.request('/api/public/products/' + product['id'], authenticated=False)['product']
                self.assertEqual(public['face_calibration'], calibration)

    def test_rejects_invalid_anchor_and_nonfinite_values(self):
        product = self.product('earring')
        for calibration in ({'anchor': [2, 0, 0]}, {'offset_mm': [1001, 0, 0]}, {'side': 'unknown'}, {'height_mm': float('nan')}):
            with self.subTest(calibration=calibration), self.assertRaises(urllib.error.HTTPError) as error:
                self.request('/api/admin/products/' + product['id'] + '/face-calibration', calibration, 'PUT')
            self.assertEqual(error.exception.code, 422)

    def test_calibration_requires_admin(self):
        product = self.product('necklace')
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request('/api/admin/products/' + product['id'] + '/face-calibration', {'height_mm': 180}, 'PUT', authenticated=False)
        self.assertEqual(error.exception.code, 401)

    def test_retired_hand_categories_cannot_be_created(self):
        for category in ('ring', 'bracelet'):
            with self.subTest(category=category), self.assertRaises(urllib.error.HTTPError) as error:
                self.product(category)
            self.assertEqual(error.exception.code, 422)

    def test_browser_can_preflight_calibration_put(self):
        request = urllib.request.Request(self.base + '/api/admin/products/example/face-calibration', headers={
            'Origin': 'http://localhost:3000', 'Access-Control-Request-Method': 'PUT',
            'Access-Control-Request-Headers': 'authorization,content-type'}, method='OPTIONS')
        with urllib.request.urlopen(request, timeout=5) as response:
            self.assertEqual(response.status, 200)
            self.assertIn('PUT', response.headers['Access-Control-Allow-Methods'])

    def test_ring_calibration_route_removed(self):
        product = self.product('earring')
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request('/api/admin/products/' + product['id'] + '/ring-calibration', {}, 'PUT')
        self.assertEqual(error.exception.code, 404)

if __name__ == '__main__':
    unittest.main()
