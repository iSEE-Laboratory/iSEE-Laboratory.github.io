#!/usr/bin/env python3
"""
视频批量压缩脚本
递归遍历指定目录下的所有视频文件，压缩到原来大小的约20%
使用 FFmpeg 进行压缩
"""

import os
import subprocess
import sys
from pathlib import Path

# 支持的视频格式
VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'}

def get_video_bitrate(file_path):
    """获取视频的比特率"""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', str(file_path)],
            capture_output=True,
            text=True
        )
        import json
        info = json.loads(result.stdout)
        bitrate = int(info['format'].get('bit_rate', 0))
        return bitrate
    except Exception as e:
        print(f"  无法获取比特率: {e}")
        return None

def compress_video(input_path, output_path, target_ratio=0.2):
    """
    压缩单个视频文件
    
    Args:
        input_path: 输入视频路径
        output_path: 输出视频路径
        target_ratio: 目标压缩比例 (0.2 表示压缩到原来的20%)
    """
    # 获取原始比特率
    original_bitrate = get_video_bitrate(input_path)
    
    if original_bitrate:
        # 计算目标比特率
        target_bitrate = int(original_bitrate * target_ratio)
        # 确保比特率不会太低
        target_bitrate = max(target_bitrate, 100000)  # 最低 100kbps
        bitrate_arg = f"{target_bitrate // 1000}k"
    else:
        # 如果无法获取原始比特率，使用较低的固定比特率
        bitrate_arg = "500k"
    
    print(f"  目标比特率: {bitrate_arg}")
    
    # 使用 FFmpeg 压缩视频
    # -c:v libx264: 使用 H.264 编码器
    # -crf: 恒定质量模式 (18-28 是合理范围，数值越大压缩越高)
    # -preset: 编码速度预设
    # -c:a aac: 音频使用 AAC 编码
    # -b:a: 音频比特率
    cmd = [
        'ffmpeg',
        '-i', str(input_path),
        '-c:v', 'libx264',
        '-b:v', bitrate_arg,
        '-preset', 'medium',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-y',  # 覆盖输出文件
        str(output_path)
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            return True
        else:
            print(f"  FFmpeg 错误: {result.stderr[:500]}")
            return False
    except FileNotFoundError:
        print("  错误: 未找到 FFmpeg，请确保已安装 FFmpeg 并添加到系统 PATH")
        return False
    except Exception as e:
        print(f"  压缩失败: {e}")
        return False

def get_file_size_mb(file_path):
    """获取文件大小 (MB)"""
    return os.path.getsize(file_path) / (1024 * 1024)

def compress_videos_recursive(root_dir, target_ratio=0.2, replace_original=True):
    """
    递归压缩目录下的所有视频文件
    
    Args:
        root_dir: 根目录路径
        target_ratio: 目标压缩比例
        replace_original: 是否替换原文件
    """
    root_path = Path(root_dir)
    
    if not root_path.exists():
        print(f"错误: 目录不存在 - {root_dir}")
        return
    
    # 统计信息
    total_files = 0
    success_count = 0
    failed_count = 0
    total_saved = 0
    skipped_files = []  # 记录跳过的文件
    
    # 递归查找所有视频文件
    video_files = []
    for ext in VIDEO_EXTENSIONS:
        video_files.extend(root_path.rglob(f'*{ext}'))
        video_files.extend(root_path.rglob(f'*{ext.upper()}'))
    
    # 去重
    video_files = list(set(video_files))
    
    print(f"找到 {len(video_files)} 个视频文件")
    print("-" * 60)
    
    for video_path in video_files:
        total_files += 1
        print(f"\n[{total_files}/{len(video_files)}] 处理: {video_path}")
        
        original_size = get_file_size_mb(video_path)
        print(f"  原始大小: {original_size:.2f} MB")
        
        # 创建临时输出文件
        temp_output = video_path.with_suffix('.temp.mp4')
        
        # 压缩视频
        if compress_video(video_path, temp_output, target_ratio):
            new_size = get_file_size_mb(temp_output)
            saved = original_size - new_size
            compression_ratio = (new_size / original_size) * 100 if original_size > 0 else 0
            
            print(f"  压缩后大小: {new_size:.2f} MB")
            print(f"  压缩比例: {compression_ratio:.1f}%")
            print(f"  节省空间: {saved:.2f} MB")
            
            if replace_original:
                # 尝试删除原文件并替换，如果失败则重试几次
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        import time
                        time.sleep(0.5)  # 等待文件句柄释放
                        # 删除原文件，重命名临时文件
                        os.remove(video_path)
                        # 保持原始扩展名或统一为 mp4
                        final_output = video_path.with_suffix('.mp4')
                        os.rename(temp_output, final_output)
                        print(f"  ✓ 已替换原文件")
                        success_count += 1
                        total_saved += saved
                        break
                    except PermissionError as e:
                        if attempt < max_retries - 1:
                            print(f"  ⚠ 文件被占用，重试中 ({attempt + 1}/{max_retries})...")
                            time.sleep(1)
                        else:
                            print(f"  ✗ 权限错误，跳过此文件: {e}")
                            skipped_files.append(str(video_path))
                            # 清理临时文件
                            if temp_output.exists():
                                try:
                                    os.remove(temp_output)
                                except:
                                    pass
                            failed_count += 1
            else:
                # 保留原文件，压缩后的文件添加 _compressed 后缀
                final_output = video_path.with_stem(video_path.stem + '_compressed').with_suffix('.mp4')
                os.rename(temp_output, final_output)
                print(f"  ✓ 保存为: {final_output}")
                success_count += 1
                total_saved += saved
        else:
            failed_count += 1
            # 清理临时文件
            if temp_output.exists():
                try:
                    os.remove(temp_output)
                except:
                    pass
            print(f"  ✗ 压缩失败")
    
    # 打印统计信息
    print("\n" + "=" * 60)
    print("压缩完成!")
    print(f"  成功: {success_count} 个文件")
    print(f"  失败: {failed_count} 个文件")
    print(f"  总计节省: {total_saved:.2f} MB")
    
    # 打印跳过的文件列表
    if skipped_files:
        print("\n" + "-" * 60)
        print(f"⚠ 以下 {len(skipped_files)} 个文件因权限问题被跳过:")
        for f in skipped_files:
            print(f"  - {f}")

def main():
    # 获取脚本所在目录
    script_dir = Path(__file__).parent
    
    print("=" * 60)
    print("视频批量压缩工具")
    print("=" * 60)
    print(f"目标目录: {script_dir}")
    print(f"压缩目标: 原大小的 20%")
    print("=" * 60)
    
    # 确认操作
    if len(sys.argv) > 1 and sys.argv[1] == '-y':
        confirm = 'y'
    else:
        confirm = input("\n是否开始压缩? (y/n): ").strip().lower()
    
    if confirm == 'y':
        compress_videos_recursive(
            script_dir,
            target_ratio=0.2,
            replace_original=True  # 设为 False 可保留原文件
        )
    else:
        print("已取消操作")

if __name__ == '__main__':
    main()
