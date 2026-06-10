import os
import urllib.request
import ssl
import re
import html
import subprocess

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    bin_dir = os.path.join(base_dir, "bin")
    os.makedirs(bin_dir, exist_ok=True)
    
    landing_url = "https://sourceforge.net/projects/autotrace/files/AutoTrace/0.31.1/autotrace-0.31.1-w32.zip/download"
    print(f"Fetching landing page: {landing_url}")
    req = urllib.request.Request(
        landing_url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    with urllib.request.urlopen(req, context=ctx) as response:
        content = response.read().decode('utf-8', errors='ignore')
    
    # Find meta refresh url
    match = re.search(r'<meta http-equiv="refresh"\s+content="[^;]*;\s*url=([^"]+)"', content, re.IGNORECASE)
    if not match:
        raise ValueError("Could not find meta-refresh tag on page.")
    
    redirect_url = html.unescape(match.group(1))
    print(f"Parsed redirect URL: {redirect_url}")
    
    zip_path = os.path.join(bin_dir, "autotrace.zip")
    
    mirrors = ['freefr', 'iweb', 'master', 'tenet']
    success = False
    
    for mirror in mirrors:
        url = re.sub(r'use_mirror=[^&]*', f'use_mirror={mirror}', redirect_url)
        if 'use_mirror=' not in url:
            url += f"&use_mirror={mirror}"
            
        print(f"Trying to download from mirror '{mirror}' via curl: {url}")
        res = subprocess.run(["curl.exe", "-k", "-L", "-o", zip_path, url], capture_output=True, text=True)
        print("Curl STDOUT:", res.stdout)
        print("Curl STDERR:", res.stderr)
        
        import zipfile
        if os.path.exists(zip_path) and zipfile.is_zipfile(zip_path):
            print(f"Success with mirror {mirror}! Unzipping...")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(bin_dir)
            os.remove(zip_path)
            print("Autotrace extracted.")
            success = True
            break
        else:
            print(f"Failed or invalid zip file with mirror {mirror}.")
            if os.path.exists(zip_path):
                os.remove(zip_path)
                
    if success:
        print("Finished successfully.")
    else:
        print("Failed to download Autotrace from all specified mirrors.")

if __name__ == "__main__":
    main()
