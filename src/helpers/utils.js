function fromPairs(arr) {
  let res = {};
  arr.forEach((d) => {
    res[d[0]] = d[1];
  });
  return res;
};

/**
 * click copy
 *
 * @param {Element} value - copy string
 * @param {Element} cb - callback function
 */
const copyString = (value, cb) => {
  const textarea = document.createElement('textarea')
  textarea.readOnly = 'readonly'
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  textarea.value = value
  document.body.appendChild(textarea)
  textarea.select()
  const result = document.execCommand('Copy')
  document.body.removeChild(textarea)
  if (result && cb) { cb() }
}

export { fromPairs, copyString };