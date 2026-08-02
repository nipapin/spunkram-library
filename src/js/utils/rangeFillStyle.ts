// Заливка "прогресса" для <input type="range"> через background-gradient на самом
// инпуте (см. .range в _ui.scss). Наивный вариант (граница ровно на pct%) не совпадает
// с реальным центром thumb: у него есть физическая ширина (14px, ::-webkit-slider-thumb),
// и его центр бегает не от 0% до 100% трека, а от half-thumb до (100% - half-thumb).
// Из-за этого при pct > 50% заливка убегает вперёд thumb, а при pct < 50% — отстаёт
// (расхождение растёт к краям, ровно 0 на середине). Компенсируем половиной ширины
// thumb с учётом его "сжатия" по мере приближения к краям трека.
const THUMB_WIDTH = 14;

export const rangeFillStyle = (value: number, min: number, max: number, thumbWidth = THUMB_WIDTH) => {
  const pct = ((value - min) / (max - min)) * 100;
  const offset = thumbWidth * (0.5 - pct / 100);
  const stop = `calc(${pct}% + ${offset}px)`;
  return {
    backgroundImage: `linear-gradient(to right, var(--accent) ${stop}, var(--border-strong) ${stop})`,
    backgroundSize: "100% 4px",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
};
