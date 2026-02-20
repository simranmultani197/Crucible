import subprocess
import sys

def check_gpu():
    print("Testing GPU Acceleration inside Crucible Sandbox...")
    try:
        # Check for Vulkan devices often exposed by Venus
        vulkan_info = subprocess.run(["vulkaninfo"], capture_output=True, text=True)
        if vulkan_info.returncode == 0 and "Venus" in vulkan_info.stdout:
            print("SUCCESS: Venus Vulkan-to-Metal translation layer detected.")
            return True
            
        # Check for Dri nodes
        ls_dri = subprocess.run(["ls", "-l", "/dev/dri"], capture_output=True, text=True)
        if ls_dri.returncode == 0:
            print("SUCCESS: /dev/dri exists.")
            print(ls_dri.stdout)
            return True
            
        print("FAILED: No GPU acceleration capabilities found.")
        return False
    except FileNotFoundError:
        print("FAILED: Required diagnostic tools (vulkaninfo) not found.")
        return False

if __name__ == "__main__":
    if check_gpu():
        sys.exit(0)
    else:
        sys.exit(1)
