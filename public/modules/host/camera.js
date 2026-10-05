export function createCamera() {
  let scroll = 0;
  return {
    update(dt, ship) {
      scroll += (40 + ship.speed * 520) * dt;
      return scroll;
    },
    getScroll() {
      return scroll;
    },
  };
}
