import logo from "@/assets/logo.png";
import "./spunkram-boot-loader.scss";

/** Auth-boot splash: header-style logo orb + soft pulse rings. */
export function SpunkramBootLoader() {
  return (
    <div className="spunkram-boot" role="status" aria-live="polite">
      <div className="spunkram-boot__stage" aria-hidden>
        <span className="spunkram-boot__ring spunkram-boot__ring--a" />
        <span className="spunkram-boot__ring spunkram-boot__ring--b" />
        <span className="spunkram-boot__ring spunkram-boot__ring--c" />
        <div className="spunkram-boot__logo">
          <img src={logo} alt="" draggable={false} />
        </div>
      </div>
      <span className="spunkram-boot__label">Loading</span>
    </div>
  );
}
