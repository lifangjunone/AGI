const EDGE_MARGIN = 8;

function getDockedBounds(workArea, width, height, position) {
  return {
    x: position === "left"
      ? workArea.x + EDGE_MARGIN
      : workArea.x + workArea.width - width - EDGE_MARGIN,
    y: workArea.y + EDGE_MARGIN,
    width,
    height
  };
}

module.exports = { EDGE_MARGIN, getDockedBounds };
