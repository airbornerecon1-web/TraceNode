import os
import urllib.request
import ssl
import re
import zipfile
import html

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def download_file(url, dest_path):
    print(f"Trying to download: {url}")
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, context=ctx, timeout=20) as response:
            with open(dest_path, 'wb') as f:
                f.write(response.read())
        print(f"SUCCESS: Downloaded to {dest_path}")
        return True
    except Exception as e:
        print(f"FAILED: {e}")
        return False

def get_redirect_url(landing_url):
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
        raise ValueError(f"Could not find meta-refresh tag on page: {landing_url}")
    
    redirect_url = html.unescape(match.group(1))
    print(f"Parsed redirect URL: {redirect_url}")
    return redirect_url

def download_and_extract_autotrace(landing_url, target_dir, zip_name):
    os.makedirs(target_dir, exist_ok=True)
    zip_path = os.path.join(target_dir, zip_name)
    
    redirect_url = get_redirect_url(landing_url)
    
    # Try different mirrors by modifying the use_mirror parameter
    # freefr, iweb, master, tenet were the ones we resolved
    mirrors = ['freefr', 'iweb', 'master', 'tenet']
    
    for mirror in mirrors:
        # Replace the use_mirror query parameter
        url = re.sub(r'use_mirror=[^&]*', f'use_mirror={mirror}', redirect_url)
        if 'use_mirror=' not in url:
            url += f"&use_mirror={mirror}"
            
        print(f"Trying to download from mirror '{mirror}': {url}")
        try:
            req = urllib.request.Request(
                url, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            )
            with urllib.request.urlopen(req, context=ctx, timeout=20) as response:
                with open(zip_path, 'wb') as f:
                    f.write(response.read())
            
            # Verify if it's a valid zip
            if zipfile.is_zipfile(zip_path):
                print(f"Successfully downloaded {zip_name} from mirror {mirror}!")
                print("Extracting...")
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(target_dir)
                os.remove(zip_path)
                print(f"Extracted to {target_dir}")
                return True
            else:
                print(f"File from {mirror} is not a valid zip (HTML page or corrupt).")
                os.remove(zip_path)
        except Exception as e:
            print(f"Failed with mirror {mirror}: {e}")
            if os.path.exists(zip_path):
                os.remove(zip_path)
                
    return False

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    bin_dir = os.path.join(base_dir, "bin")
    os.makedirs(bin_dir, exist_ok=True)

    # 1. Download Potrace
    potrace_direct_url = "http://potrace.sourceforge.net/download/1.16/potrace-1.16.win64.zip"
    potrace_zip = os.path.join(bin_dir, "potrace.zip")
    potrace_exe_path = os.path.join(bin_dir, "potrace-1.16.win64", "potrace.exe")
    
    if not os.path.exists(potrace_exe_path):
        print("--- DOWNLOADING POTRACE ---")
        if download_file(potrace_direct_url, potrace_zip):
            print("Extracting Potrace...")
            with zipfile.ZipFile(potrace_zip, 'r') as zip_ref:
                zip_ref.extractall(bin_dir)
            os.remove(potrace_zip)
            print("Potrace extracted successfully.")
            potrace_success = True
        else:
            print("Failed to download Potrace.")
            potrace_success = False
    else:
        print("Potrace already exists.")
        potrace_success = True

    # 2. Download Autotrace
    autotrace_landing = "https://sourceforge.net/projects/autotrace/files/AutoTrace/0.31.1/autotrace-0.31.1-w32.zip/download"
    autotrace_exe_path = os.path.join(bin_dir, "autotrace.exe")
    
    if not os.path.exists(autotrace_exe_path):
        print("\n--- DOWNLOADING AUTOTRACE ---")
        autotrace_success = download_and_extract_autotrace(autotrace_landing, bin_dir, "autotrace.zip")
    else:
        print("Autotrace already exists.")
        autotrace_success = True
        
    if potrace_success and autotrace_success:
        print("\nAll downloads completed and extracted successfully!")
    else:
        print("\nOne or more downloads failed.")

if __name__ == "__main__":
    main()
