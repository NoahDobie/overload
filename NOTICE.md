# Notices

Overload is a slimmed-down derivative of [openGym](https://github.com/DuarteSantos8/openGym)
by Duarte Santos, licensed under the **GNU AGPL v3.0 or later** (see [LICENSE](LICENSE)).
Overload is distributed under the same license.

Adapted from openGym:
- `src/components/BodyMap.jsx`, `src/components/Heatmap.jsx`, `src/components/LineChart.jsx`
- `src/lib/muscles.js` (muscle list, names, shading levels)
- the history-derived progression approach in `src/lib/progression.js`
- the body-map and heatmap styles in `src/styles.css`

`src/lib/body-paths.js` is copied unchanged from openGym. Its body outlines were converted
from [MuscleMap](https://github.com/melihcolpan/MuscleMap) by Melih Colpan and are used
under the MIT License:

```
MIT License

Copyright (c) 2026 Melih Colpan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
