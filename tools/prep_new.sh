#!/bin/bash
set -e
cd "$(dirname "$0")/.."
NAMES="hw_gpu hw_memory hw_pcb hw_supercomputer hw_fiber hw_cleanroom hw_wafer_robot hw_quantum hw_soc hw_ssd library hackathon ft_autonomous ft_robot ft_vr ft_satellite ft_drones ft_medical ft_factory ft_esports ft_bigdata ft_science ft_rocket ft_telescope"
for n in $NAMES; do cp "/Users/ch1rpy/.cursor/projects/Users-ch1rpy-Desktop-Misc/assets/$n.png" "tools/raw/$n.png"; done
cd tools/esrgan
for n in $NAMES; do
  [ -f "../up/$n.png" ] || ./realesrgan-ncnn-vulkan -i "../raw/$n.png" -o "../up/$n.png" -n realesrgan-x4plus > /dev/null 2>&1 || echo "FAIL $n"
  echo "up $n"
done
cd ../..
.venv/bin/python tools/depth.py $NAMES 2>&1 | grep -v -i warn | tail -3
echo ALLDONE
