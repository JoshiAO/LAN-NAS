from PIL import Image
import os

source_path = r"C:\Users\User\.gemini\antigravity-ide\brain\9db59970-c9e1-426e-bdde-47a9bf4281a0\media__1782114717617.jpg"
target_server = r"C:\Users\User\Desktop\Mini Projects\LAN-NAS\server\static\lannas.ico"
target_client = r"C:\Users\User\Desktop\Mini Projects\LAN-NAS\client\lannas.ico"

img = Image.open(source_path)
icon_sizes = [(256, 256), (128, 128), (64, 64), (32, 32), (16, 16)]
img.save(target_server, format="ICO", sizes=icon_sizes)
img.save(target_client, format="ICO", sizes=icon_sizes)
print("Icons successfully created and deployed!")
