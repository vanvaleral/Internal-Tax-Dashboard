/* Shared by the BA dialog and server validation. Labels do not calculate tax or deadlines. */
(function(root) {
  const groups = [
    { label:"Pajak pusat - PPh", taxes:[
      "PPh Pasal 29", "PPh Pasal 21", "PPh Pasal 22", "PPh Pasal 22 Impor",
      "PPh Pasal 23", "PPh Pasal 26", "PPh Pasal 4 ayat (2)", "PPh Pasal 15",
      "PPh Pasal 19", "PPh Pasal 25", "PPh Pasal 25 Orang Pribadi",
      "PPh Pasal 25 Badan", "PPh Pasal 29 Orang Pribadi", "PPh Pasal 29 Badan",
      "PPh Final UMKM", "PPh Migas", "PPh Non-Migas Lainnya"
    ] },
    { label:"Pajak pusat - PPN dan pajak lainnya", taxes:[
      "PPN", "PPN Impor", "PPN Kegiatan Membangun Sendiri",
      "PPN Pemanfaatan BKP Tidak Berwujud / JKP dari Luar Daerah Pabean",
      "PPN PMSE", "PPnBM", "PPnBM Impor", "PBB P5L", "Bea Meterai", "Pajak Karbon"
    ] },
    { label:"Pajak daerah - Provinsi", taxes:[
      "Pajak Kendaraan Bermotor (PKB)", "Bea Balik Nama Kendaraan Bermotor (BBNKB)",
      "Pajak Alat Berat (PAB)", "Pajak Bahan Bakar Kendaraan Bermotor (PBBKB)",
      "Pajak Air Permukaan (PAP)", "Pajak Rokok", "Opsen Pajak MBLB"
    ] },
    { label:"Pajak daerah - Kabupaten / Kota", taxes:[
      "PBB-P2", "Bea Perolehan Hak atas Tanah dan Bangunan (BPHTB)",
      "PBJT - Makanan dan/atau Minuman", "PBJT - Tenaga Listrik",
      "PBJT - Jasa Perhotelan", "PBJT - Jasa Parkir", "PBJT - Jasa Kesenian dan Hiburan",
      "Pajak Reklame", "Pajak Air Tanah (PAT)", "Pajak Mineral Bukan Logam dan Batuan (MBLB)",
      "Pajak Sarang Burung Walet", "Opsen PKB", "Opsen BBNKB"
    ] },
    { label:"Pajak daerah - Periode lama", taxes:[
      "Pajak Hotel (PHR / PB1)", "Pajak Restoran (PHR / PB1)", "Pajak Hiburan",
      "Pajak Penerangan Jalan", "Pajak Parkir"
    ] }
  ];
  groups.forEach(group=>{Object.freeze(group.taxes);Object.freeze(group);});
  const catalog=Object.freeze({groups:Object.freeze(groups),taxes:Object.freeze(groups.flatMap(group=>group.taxes)),otherValue:"__other__",maxProducts:100});
  if(typeof module!=="undefined" && module.exports)module.exports=catalog;
  else root.CaseTaxTypes=catalog;
})(globalThis);
