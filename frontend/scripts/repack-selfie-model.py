"""Add Tasks input normalization metadata to the Apache-2.0 Selfie model."""
import argparse
import hashlib
import importlib.util
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--schema-dir', required=True, type=Path)
parser.add_argument('--source', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('model_pack', Path(__file__).with_name('repack-pose-model.py'))
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)
schema = pack.load_schema(args.schema_dir, 'schema_py_generated.py', 'model_schema')
metadata = pack.load_schema(args.schema_dir, 'metadata_schema_py_generated.py', 'metadata_schema')
args.output.write_bytes(pack.annotate(args.source.read_bytes(), schema, metadata, 0, 255, name='MediaPipe Selfie Segmenter'))
print('SHA256:', hashlib.sha256(args.output.read_bytes()).hexdigest())
