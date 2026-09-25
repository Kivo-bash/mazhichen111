// 只打包胶囊笔记用到的 Framework7 组件，输出普通脚本（全局变量 Framework7），
// 双击打开 index.html 也能加载。重新生成：npm run build:vendor
import Framework7 from "framework7/lite";
import Dialog from "framework7/components/dialog";
import Popup from "framework7/components/popup";
import Popover from "framework7/components/popover";
import Toast from "framework7/components/toast";
import Stepper from "framework7/components/stepper";
import Range from "framework7/components/range";
import Input from "framework7/components/input";

Framework7.use([Dialog, Popup, Popover, Toast, Stepper, Range, Input]);
window.Framework7 = Framework7;
