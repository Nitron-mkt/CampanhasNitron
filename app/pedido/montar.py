import sys, io
html_p, data_p, img_p, out_p = sys.argv[1:5]
html = io.open(html_p, encoding="utf-8").read()
data = io.open(data_p, encoding="utf-8").read()
img  = io.open(img_p,  encoding="utf-8").read()
for frag in ('<script src="app_data.js"></script>', '<script src="app_img.js"></script>'):
    assert frag in html, "nao achei: " + frag
html = html.replace('<script src="app_data.js"></script>',
                    "<script>\n" + data + "\n</script>")
html = html.replace('<script src="app_img.js"></script>',
                    "<script>\n" + img + "\n</script>")
assert "app_data.js" not in html.split("<script>")[0]
io.open(out_p, "w", encoding="utf-8").write(html)
print("gerado:", out_p, len(html.encode("utf-8")), "bytes")
