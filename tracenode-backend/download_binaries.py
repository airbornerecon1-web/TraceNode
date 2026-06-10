import os
import urllib.request
import zipfile
import ssl

def download_file(url, dest_path):
    print(f"Trying to download: {url}")
    try:
        # Create unverified SSL context to bypass expired cert on mirror
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
            with open(dest_path, 'wb') as f:
                f.write(response.read())
        print(f"SUCCESS: Downloaded to {dest_path}")
        return True
    except Exception as e:
        print(f"FAILED: {e}")
        return False

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    bin_dir = os.path.join(base_dir, "bin")
    os.makedirs(bin_dir, exist_ok=True)

    # 1. Download Potrace
    potrace_zip = os.path.join(bin_dir, "potrace.zip")
    potrace_urls = [
        "https://freefr.dl.sourceforge.net/project/potrace/potrace/1.16/potrace-1.16.win64.zip",
        "https://freefr.dl.sourceforge.net/project/potrace/1.16/potrace-1.16.win64.zip",
        "https://iweb.dl.sourceforge.net/project/potrace/potrace/1.16/potrace-1.16.win64.zip",
        "https://master.dl.sourceforge.net/project/potrace/potrace/1.16/potrace-1.16.win64.zip",
    ]
    
    potrace_exe_path = os.path.join(bin_dir, "potrace-1.16.win64", "potrace.exe")
    if not os.path.exists(potrace_exe_path):
        success = False
        for url in potrace_urls:
            if download_file(url, potrace_zip):
                if zipfile.is_zipfile(potrace_zip):
                    success = True
                    break
                else:
                    print("Downloaded file is not a valid zip (HTML page or corrupt).")
                    os.remove(potrace_zip)
        
        if success:
            print("Extracting Potrace...")
            with zipfile.ZipFile(potrace_zip, 'r') as zip_ref:
                zip_ref.extractall(bin_dir)
            os.remove(potrace_zip)
            print("Potrace extracted successfully.")
        else:
            print("Could not download Potrace from any mirror.")
    else:
        print("Potrace already exists.")

    # 2. Download Autotrace
    autotrace_zip = os.path.join(bin_dir, "autotrace.zip")
    autotrace_urls = [
        "https://freefr.dl.sourceforge.net/project/autotrace/AutoTrace/0.31.1/autotrace-0.31.1-w32.zip",
        "https://iweb.dl.sourceforge.net/project/autotrace/AutoTrace/0.31.1/autotrace-0.31.1-w32.zip",
        "https://master.dl.sourceforge.net/project/autotrace/AutoTrace/0.31.1/autotrace-0.31.1-w32.zip",
    ]
    
    autotrace_exe_path = os.path.join(bin_dir, "autotrace.exe")
    if not os.path.exists(autotrace_exe_path):
        success = False
        for url in autotrace_urls:
            if download_file(url, autotrace_zip):
                if zipfile.is_zipfile(autotrace_zip):
                    success = True
                    break
                else:
                    print("Downloaded file is not a valid zip (HTML page or corrupt).")
                    os.remove(autotrace_zip)
        
        if success:
            print("Extracting Autotrace...")
            with zipfile.ZipFile(autotrace_zip, 'r') as zip_ref:
                zip_ref.extractall(bin_dir)
            os.remove(autotrace_zip)
            print("Autotrace extracted successfully.")
        else:
            print("Could not download Autotrace from any mirror.")
    else:
        print("Autotrace already exists.")

if __name__ == "__main__":
    main()
