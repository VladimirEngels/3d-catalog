import hashlib
import io
import urllib.request
from pathlib import Path

import torch
import onnx

root = Path(__file__).resolve().parents[1]
folder = root / 'storage/ai'
folder.mkdir(parents=True, exist_ok=True)
revision = 'a4abfb2979a7bbff3f69f58f58ae324608821e27'
raw = f'https://raw.githubusercontent.com/xinntao/Real-ESRGAN/{revision}'

def download(url, expected):
    request = urllib.request.Request(url, headers={'User-Agent': '3D-Catalog-model-setup'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError('Source checksum mismatch')
    return data

architecture = download(
    f'{raw}/realesrgan/archs/srvgg_arch.py',
    '7419a75e789ca09295266563d74a6d7c08d6c24502af6b0a919b1811d0a0be59',
).decode('utf-8')
architecture = architecture.replace('from basicsr.utils.registry import ARCH_REGISTRY\n', '')
architecture = architecture.replace('@ARCH_REGISTRY.register()\n', '')
namespace = {}
exec(compile(architecture, 'official-srvgg.py', 'exec'), namespace)
weights = []
for name, checksum in [
    ('realesr-general-x4v3.pth', '8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292'),
    ('realesr-general-wdn-x4v3.pth', '1641f8c4464b9f097c9fdda5589273713f67cf59f3d909e0bd688f0cee269dca'),
]:
    data = download(f'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/{name}', checksum)
    weights.append(torch.load(io.BytesIO(data), map_location='cpu', weights_only=True)['params'])
model = namespace['SRVGGNetCompact'](
    num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4, act_type='prelu',
)
parameters = {key: weights[0][key] * 0.5 + weights[1][key] * 0.5 for key in weights[0]}
model.load_state_dict(parameters, strict=True)
model.eval()
output = folder / 'general-x4v3.onnx'
temporary = folder / 'general-x4v3.pending.onnx'
torch.onnx.export(
    model, torch.zeros(1, 3, 64, 64), str(temporary),
    input_names=['input'], output_names=['output'], opset_version=17,
    dynamic_axes={
        'input': {2: 'height', 3: 'width'},
        'output': {2: 'height_x4', 3: 'width_x4'},
    },
    dynamo=False, do_constant_folding=True,
)
onnx.checker.check_model(onnx.load(str(temporary)), full_check=True)
if hashlib.sha256(temporary.read_bytes()).hexdigest() != 'b64a964ac02e37de542bc8ab2dce712c5c2b4e65d8d9a14914887049c5bdaf12':
    raise RuntimeError('Export checksum mismatch; use torch 2.15.0+cpu and onnx 1.23.2')
license_text = download(f'{raw}/LICENSE', '4a699ec4863d96a91fc265948a0c90033f7e8735d515524dcf3444736406e0c2')
(folder / 'LICENSE.Real-ESRGAN').write_bytes(license_text)
temporary.replace(output)
print('Prepared model:', output)
