# 素材来源与授权 · CREDITS

本文件列出《计算机科学与技术》专业宣传片中全部第三方素材的来源与许可。
仓库代码与文档采用 [CC BY-NC-SA 4.0](./LICENSE)；下列素材**各自遵循其原始许可**。

---

## 一、原创内容

| 内容 | 说明 |
| --- | --- |
| **全部画面** | 由 Remotion + Three.js 程序化生成：芯片版图、晶圆、夜景城市、数据中心、地球、神经网络、犹他茶壶等三维元素全部由 GLSL 着色器与代码生成，不含任何影视素材或商标图形 |
| **全部字幕与文案** | 原创撰写，片中技术数据均以可查证的公开资料为准（详见 [`tools/prompt.md`](./tools/prompt.md) 第十二节） |
| **配乐 `public/audio/music.wav`** | **完全原创**，由 `audio/compose2.py` 逐样本合成（A 小调，120 BPM，112 小节）。钢琴与弦乐通过 FluidSynth 渲染采样音色，合成器、鼓组与音效由 numpy 直接合成 |
| **胶片颗粒 `public/textures/grain0–5.png`** | 程序化生成 |
| **界面与图标** | 代码绘制的 SVG / Canvas 图形，无第三方图标库 |

---

## 二、字体

全部 6 款字体均为 **SIL Open Font License 1.1**，随仓库分发于 `public/fonts/`。

| 字体 | 用途 | 版权 | 许可 |
| --- | --- | --- | --- |
| **Noto Serif SC** | 中文主标题、章节卡 | © 2017–2024 Adobe | [OFL 1.1](https://scripts.sil.org/OFL) |
| **Noto Sans SC** | 中文正文、信息栏 | © 2014–2021 Adobe | [OFL 1.1](https://scripts.sil.org/OFL) |
| **JetBrains Mono** | 代码、等宽信息 | © 2020 The JetBrains Mono Project Authors | [OFL 1.1](https://scripts.sil.org/OFL) |
| **Space Grotesk** | 英文显示字体 | © 2020 The Space Grotesk Project Authors | [OFL 1.1](https://scripts.sil.org/OFL) |
| **Orbitron** | 科技感英文标题 | © 2018 The Orbitron Project Authors | [OFL 1.1](https://scripts.sil.org/OFL) |
| **Inter** | 英文正文、字幕 | © 2016 The Inter Project Authors | [OFL 1.1](https://scripts.sil.org/OFL) |

> OFL 1.1 允许自由使用、修改与再分发（含商用），但要求保留版权与许可声明，且不得单独售卖字体本身。

---

## 三、照片

`public/photos/` 下的 **31 张照片**及其同名 **31 张深度图**。

- **原始照片**：由**生成式图像模型**为本片原创生成（AI-generated），经 Real-ESRGAN 4× 超分，再由 Depth Anything V2 生成深度图驱动 2.5D 视差
- **包含场景**：硬件（GPU / 内存 / 电路板 / 超级计算机 / 光纤 / 洁净室 / 晶圆机器人 / 量子计算 / 手机芯片 / 固态硬盘）、校园（暮色教学楼 / 阶梯教室 / 图书馆 / 深夜编程 / ICPC 赛场 / 黑客松 / 团队实验室 / 毕业）、前沿（自动驾驶 / 具身智能 / VR / 卫星互联网 / 无人机 / 智慧医疗 / 智能制造 / 电竞 / 大数据 / AI for Science / 航天 / 射电天文）、街景
- **原始未处理文件**保存在本地 `tools/raw/`（已通过 `.gitignore` 排除），仓库内仅包含处理后的成品

> ⚠️ **再使用提示**：这些照片由 AI 生成模型产出，属本项目原创成果，随仓库以 CC BY-NC-SA 4.0 发布。若你要把本项目用于**商业用途**，请自行替换为你拥有完整授权的实拍或授权图片，并同步核对所用生成模型的商用条款。

---

## 四、贴图

| 文件 | 来源 | 许可 |
| --- | --- | --- |
| `textures/earth-blue-marble.jpg` | NASA Blue Marble 地球影像 | 公有领域（NASA） |
| `textures/earth-lights-8k.jpg` | NASA Black Marble 夜间灯光合成 | 公有领域（NASA） |
| `textures/earth-water.png` | 地球水体掩膜，用于镜面高光 | 公有领域 / 自制 |
| `textures/night-sky.png` | 星空背景贴图 | 公有领域 |
| `textures/earth-dark.jpg`、`earth-night.jpg`、`earth-topology.png` | 地球材质备选贴图 | 公有领域 / 自制 |
| `textures/grain0–5.png` | 程序化胶片颗粒 | 本项目原创 |

NASA 影像说明：NASA 产出的影像通常不受版权限制，但可能涉及第三方可识别人物或商标；请在商用前自行确认。本仓库仅将其用于非商业的教育演示作品。

---

## 五、音频采样音色库

音色库体积较大（数百 MB），**不随仓库分发**，通过 `.gitignore` 排除 `audio/sf/`。重新合成配乐时需自行下载：

| 音色库 | 用途 | 许可 |
| --- | --- | --- |
| **MuseScore General** (`MuseScore_General.sf2`) | 弦乐、铜管等管乐组 | [MIT](https://github.com/musescore/MuseScore-General/blob/master/LICENSE) |
| **Salamander Grand Piano v3** | 三角钢琴主旋律 | [CC BY 3.0](https://github.com/sfzinstruments/SalamanderGrandPiano) |
| **GeneralUser GS** | 通用 GM 音色 | 免费使用（Free License） |

渲染依赖 **FluidSynth**（[LGPL-2.1-or-later](https://github.com/FluidSynth/fluidsynth)）。

---

## 六、工具与模型

| 工具 / 模型 | 用途 | 许可 |
| --- | --- | --- |
| [Remotion](https://www.remotion.dev/) 4.0.529 | 视频合成与渲染 | Remotion License（见下方提示） |
| [Three.js](https://threejs.org/) 0.186.1 | 3D 渲染 | MIT |
| [React](https://react.dev/) 19.2 | UI 框架 | MIT |
| [postprocessing](https://github.com/pmndrs/postprocessing) 6.37 | Bloom / 色差 | MIT |
| [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing) 3.1.3 | React 绑定 | MIT |
| [Depth Anything V2 Large](https://huggingface.co/depth-anything/Depth-Anything-V2-Large-hf) | 深度图估计 | Apache-2.0 |
| [DETR ResNet-101](https://huggingface.co/facebook/detr-resnet-101) | 街景目标检测 | Apache-2.0 |
| [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | 照片 4× 超分 | BSD-3-Clause |
| [FluidSynth](https://github.com/FluidSynth/fluidsynth) | `.sf2` 采样渲染 | LGPL-2.1+ |
| [numpy](https://numpy.org/) / [SciPy](https://scipy.org/) / [Numba](https://numba.pydata.org/) | 数值合成 | BSD-3-Clause |
| [pedalboard](https://github.com/spotify/pedalboard) | 混音与母带 | Apache-2.0 |
| [pyloudnorm](https://github.com/csteinmetz1/pyloudnorm) | 响度归一 | MIT |
| [soundfile](https://github.com/libsndfile/libsndfile) | 音频读写 | LGPL-2.1+ |
| [mido](https://github.com/mido/mido) | MIDI 读写 | MIT |

> ⚠️ **Remotion 许可提示**：Remotion 采用自定义许可协议——个人与 **3 人以下**团队免费用于商业用途；超过 3 人的公司需购买 [Company License](https://www.remotion.dev/license)。使用本仓库渲染成片前，请确认你的使用场景符合 [Remotion License](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)。

---

## 七、人物与肖像

片中所有出现的**人物形象均为 AI 生成的虚构人物**，不对应任何真实个人；未使用任何名人肖像或受版权保护的角色形象。

---

## 八、商标

片中未使用任何商标图形。`Recognized` / `Accepted` 等界面文字为通用编程竞赛用语，不对应特定厂商标识。

---

## 九、致谢

本片由**人类与 AI 协作**完成（片尾署名「人机共创」）。创作过程中使用了上述全部开源工具与模型，感谢每一位维护者。

如果你 fork 了本项目并产出了新的作品，欢迎在 Pull Request 中补充你的署名。
