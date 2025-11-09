let allData = [];
let currentRoute = '';

async function loadCSV() {
  try {
    const response = await fetch('data.csv');
    if (!response.ok) {
      throw new Error('无法加载 data.csv 文件');
    }
    const text = await response.text();
    return parseCSV(text);
  } catch (error) {
    console.error('加载CSV失败:', error);
    throw error;
  }
}

function detectDelimiter(line) {
  const commaCount = (line.match(/,/g) || []).length;
  const semicolonCount = (line.match(/;/g) || []).length;
  const tabCount = (line.match(/\t/g) || []).length;

  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  if (semicolonCount > commaCount) return ';';
  return ',';
}

function parseCSV(text) {
  let cleanText = text;

  if (cleanText.charCodeAt(0) === 0xFEFF) {
    cleanText = cleanText.slice(1);
  }

  const lines = cleanText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV 文件格式不正确');
  }

  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = lines[0].split(delimiter).map(h => h.trim());

  const headerIndexMap = {};
  rawHeaders.forEach((header, index) => {
    if (header !== 'mg/kg') {
      headerIndexMap[header] = index;
    }
  });

  const numericFields = [
    'longitude', 'latitude',
    'soil_pH', 'soil_Cr', 'soil_Ni', 'soil_Cu', 'soil_Zn', 'soil_As', 'soil_Cd', 'soil_Hg', 'soil_Pb',
    'herb_Cr', 'herb_Ni', 'herb_Cu', 'herb_Zn', 'herb_As', 'herb_Cd', 'herb_Hg', 'herb_Pb'
  ];

  const data = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = lines[i].split(delimiter).map(v => v.trim());
    const row = {};

    Object.entries(headerIndexMap).forEach(([header, index]) => {
      const value = values[index] || '';

      if (numericFields.includes(header)) {
        if (value === '' || value === 'mg/kg') {
          row[header] = null;
        } else {
          const num = Number(value);
          row[header] = isNaN(num) ? null : num;
        }
      } else {
        row[header] = value === 'mg/kg' ? '' : value;
      }
    });

    data.push(row);
  }

  console.log('CSV加载完成，共', data.length, '行');
  if (data.length > 0) {
    console.log('第一行数据:', data[0]);
  }

  return data;
}

function getUniqueHerbs(data) {
  const herbMap = new Map();

  data.forEach(row => {
    const name = row.herb_name;
    if (!name) return;

    if (!herbMap.has(name)) {
      herbMap.set(name, []);
    }
    herbMap.get(name).push(row);
  });

  return Array.from(herbMap.entries()).map(([name, rows]) => {
    const hasCoordinates = rows.some(r => r.longitude !== null && r.latitude !== null);
    return {
      name,
      count: rows.length,
      hasCoordinates,
      rows
    };
  });
}

function renderHome() {
  const herbs = getUniqueHerbs(allData);

  const html = `
    <div class="intro">
      <h2>项目简介</h2>
      <p>本数据库是依托江苏省药品监督管理局药品监管科学科研计划项目“江苏道地药材重金属及有害元素风险评估和限量研究”构建的综合性数据平台。
      平台系统收录了苏薄荷、苏芡实、茅苍术、苏菊、白首乌、黄蜀葵花、银杏叶、白果、延胡索、女贞子、瓜蒌皮、天花粉、宜兴百合、浙贝母、金银花、蒲公英、泰半夏/邳半夏、蟾酥等19种江苏道地药材的重金属及有害元素检测数据，全面涵盖了铅、镉、砷、汞、铜等关键受控元素的含量信息。
      数据库整合了药材品种、产地、采样时间、元素含量等多维度信息，支持按品种、产地、元素类别等多角度交叉查询与对比分析。
      本该平台旨在为药品监管部门、中药材生产企业、科研机构及社会公众提供科学、可追溯的数据服务，助力江苏道地药材在全链条质量控制、风险精准预警及行业标准优化制定等方面的实践应用，切实保障用药安全，赋能并推动中医药产业向规范化和高品质方向持续发展。</p>
     
    </div>
    <div class="card-grid">
      ${herbs.map(herb => `
        <div class="card" onclick="navigateTo('#/herb/${encodeURIComponent(herb.name)}')">
          <h3>${herb.name}</h3>
          <div class="card-info">
            <span>
              <strong>采样点数量：</strong>
              <span>${herb.count}</span>
            </span>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('app').innerHTML = html;
}

function renderTable() {
  let filteredData = [...allData];
  let currentPage = 1;
  const pageSize = 20;
  let sortColumn = null;
  let sortDirection = 'asc';
  let searchTerm = '';

  function applySearch() {
    if (!searchTerm) {
      filteredData = [...allData];
    } else {
      const term = searchTerm.toLowerCase();
      filteredData = allData.filter(row => {
        return (
          (row.herb_name && row.herb_name.toLowerCase().includes(term)) ||
          (row.city && row.city.toLowerCase().includes(term)) ||
          (row.town && row.town.toLowerCase().includes(term))
        );
      });
    }
    currentPage = 1;
    renderTableContent();
  }

  function sortData(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }

    filteredData.sort((a, b) => {
      let valA = a[column];
      let valB = b[column];

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();

      if (sortDirection === 'asc') {
        return strA < strB ? -1 : strA > strB ? 1 : 0;
      } else {
        return strA > strB ? -1 : strA < strB ? 1 : 0;
      }
    });

    renderTableContent();
  }

  function renderTableContent() {
    const totalPages = Math.ceil(filteredData.length / pageSize);
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const pageData = filteredData.slice(startIdx, endIdx);

    const columns = [
      { key: 'herb_name', label: '中药材名称' },
      { key: 'city', label: '城市' },
      { key: 'town', label: '乡镇' },
      { key: 'collection_date', label: '采样日期' },
      { key: 'longitude', label: '经度' },
      { key: 'latitude', label: '纬度' },
      { key: 'soil_pH', label: '土壤pH' },
      { key: 'soil_Cr', label: '土壤铬(mg/kg)' },
      { key: 'soil_Ni', label: '土壤镍(mg/kg)' },
      { key: 'soil_Cu', label: '土壤铜(mg/kg)' },
      { key: 'soil_Zn', label: '土壤锌(mg/kg)' },
      { key: 'soil_As', label: '土壤砷(mg/kg)' },
      { key: 'soil_Cd', label: '土壤镉(mg/kg)' },
      { key: 'soil_Hg', label: '土壤汞(mg/kg)' },
      { key: 'soil_Pb', label: '土壤铅(mg/kg)' },
      { key: 'herb_Cr', label: '药材铬(mg/kg)' },
      { key: 'herb_Ni', label: '药材镍(mg/kg)' },
      { key: 'herb_Cu', label: '药材铜(mg/kg)' },
      { key: 'herb_Zn', label: '药材锌(mg/kg)' },
      { key: 'herb_As', label: '药材砷(mg/kg)' },
      { key: 'herb_Cd', label: '药材镉(mg/kg)' },
      { key: 'herb_Hg', label: '药材汞(mg/kg)' },
      { key: 'herb_Pb', label: '药材铅(mg/kg)' }
    ];

    const formatCellValue = (value) => {
      if (value === null || value === undefined) {
        return '-';
      }
      if (value === '') {
        return '-';
      }
      return String(value);
    };

    const html = `
      <div class="search-bar">
        <input
          type="text"
          id="searchInput"
          placeholder="搜索中药材名称、城市或乡镇..."
          value="${searchTerm}"
        />
        <span style="color: #666; margin-left: auto;">共 ${allData.length} 行</span>
      </div>
      <div class="table-container">
        <div class="table-wrapper">
          ${filteredData.length === 0 ? '<div class="empty-state">没有找到匹配的数据</div>' : `
            <table>
              <thead>
                <tr>
                  ${columns.map(col => `
                    <th class="sortable ${sortColumn === col.key ? (sortDirection === 'asc' ? 'sort-asc' : 'sort-desc') : ''}"
                        data-column="${col.key}">
                      ${col.label}
                    </th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
                ${pageData.map(row => `
                  <tr>
                    ${columns.map(col => `
                      <td>${formatCellValue(row[col.key])}</td>
                    `).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
        ${filteredData.length > 0 ? `
          <div class="pagination">
            <button id="firstPage" ${currentPage === 1 ? 'disabled' : ''}>首页</button>
            <button id="prevPage" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>
            <span>第 ${currentPage} / ${totalPages} 页（共 ${filteredData.length} 条记录）</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>跳转到</span>
              <input type="number" id="pageInput" min="1" max="${totalPages}" value="${currentPage}"
                     style="width: 60px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; text-align: center; font-size: 14px;">
              <button id="goToPage" style="padding: 4px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">跳转</button>
            </div>
            <button id="nextPage" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>
            <button id="lastPage" ${currentPage === totalPages ? 'disabled' : ''}>末页</button>
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('app').innerHTML = html;

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        applySearch();
      });
    }

    document.querySelectorAll('th[data-column]').forEach(th => {
      th.addEventListener('click', () => {
        sortData(th.dataset.column);
      });
    });

    const prevBtn = document.getElementById('prevPage');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderTableContent();
        }
      });
    }

    const nextBtn = document.getElementById('nextPage');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderTableContent();
        }
      });
    }

    const firstBtn = document.getElementById('firstPage');
    if (firstBtn) {
      firstBtn.addEventListener('click', () => {
        currentPage = 1;
        renderTableContent();
      });
    }

    const lastBtn = document.getElementById('lastPage');
    if (lastBtn) {
      lastBtn.addEventListener('click', () => {
        currentPage = totalPages;
        renderTableContent();
      });
    }

    const goToPageBtn = document.getElementById('goToPage');
    const pageInput = document.getElementById('pageInput');
    if (goToPageBtn && pageInput) {
      goToPageBtn.addEventListener('click', () => {
        const targetPage = parseInt(pageInput.value);
        if (targetPage >= 1 && targetPage <= totalPages) {
          currentPage = targetPage;
          renderTableContent();
        } else {
          alert(`请输入 1 到 ${totalPages} 之间的页码`);
        }
      });

      pageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const targetPage = parseInt(pageInput.value);
          if (targetPage >= 1 && targetPage <= totalPages) {
            currentPage = targetPage;
            renderTableContent();
          } else {
            alert(`请输入 1 到 ${totalPages} 之间的页码`);
          }
        }
      });
    }
  }

  renderTableContent();
}

function renderHerbDetail(herbName) {
  const decodedName = decodeURIComponent(herbName);
  const herbData = allData.filter(row => row.herb_name === decodedName);

  if (herbData.length === 0) {
    document.getElementById('app').innerHTML = `
      <div class="error">未找到中药材"${decodedName}"的数据</div>
    `;
    return;
  }

  const cities = new Set(herbData.map(r => r.city).filter(Boolean));
  const towns = new Set(herbData.map(r => r.town).filter(Boolean));

  let statsHtml = '';
  if (herbData.length >= 2) {
    const soilFields = ['soil_pH', 'soil_Cr', 'soil_Ni', 'soil_Cu', 'soil_Zn', 'soil_As', 'soil_Cd', 'soil_Hg', 'soil_Pb'];
    const herbFields = ['herb_Cr', 'herb_Ni', 'herb_Cu', 'herb_Zn', 'herb_As', 'herb_Cd', 'herb_Hg', 'herb_Pb'];

    const fieldLabels = {
      soil_pH: '土壤pH',
      soil_Cr: '土壤铬',
      soil_Ni: '土壤镍',
      soil_Cu: '土壤铜',
      soil_Zn: '土壤锌',
      soil_As: '土壤砷',
      soil_Cd: '土壤镉',
      soil_Hg: '土壤汞',
      soil_Pb: '土壤铅',
      herb_Cr: '药材铬',
      herb_Ni: '药材镍',
      herb_Cu: '药材铜',
      herb_Zn: '药材锌',
      herb_As: '药材砷',
      herb_Cd: '药材镉',
      herb_Hg: '药材汞',
      herb_Pb: '药材铅'
    };

    const calculateMean = (field) => {
      const values = herbData.map(r => r[field]).filter(v => v !== null && v !== undefined && !isNaN(v));
      if (values.length === 0) return '-';
      const sum = values.reduce((a, b) => a + b, 0);
      return (sum / values.length).toFixed(2);
    };

    const allFields = [...soilFields, ...herbFields];
    statsHtml = `
      <div class="section">
        <h3>指标均值统计</h3>
        <div class="stats-grid">
          ${allFields.map(field => `
            <div class="stat-card">
              <label>${fieldLabels[field]}</label>
              <div class="value">${calculateMean(field)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  const html = `
    <div class="detail-page">
      <div class="detail-header">
        <h2>${decodedName}</h2>
        <button class="back-button" onclick="navigateTo('#/home')">返回首页</button>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <label>中药材名称</label>
          <div class="value">${decodedName}</div>
        </div>
        <div class="info-item">
          <label>采样点数量</label>
          <div class="value">${herbData.length}</div>
        </div>
        <div class="info-item">
          <label>涉及城市数</label>
          <div class="value">${cities.size}</div>
        </div>
        <div class="info-item">
          <label>涉及乡镇数</label>
          <div class="value">${towns.size}</div>
        </div>
      </div>

      <div class="section">
        <h3>采样点详情</h3>
        <div class="table-container">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>城市</th>
                  <th>乡镇</th>
                  <th>采样日期</th>
                  <th>经度</th>
                  <th>纬度</th>
                  <th>土壤铅(mg/kg)</th>
                  <th>土壤镉(mg/kg)</th>
                  <th>药材铅(mg/kg)</th>
                  <th>药材镉(mg/kg)</th>
                </tr>
              </thead>
              <tbody>
                ${herbData.map(row => `
                  <tr>
                    <td>${row.city || '-'}</td>
                    <td>${row.town || '-'}</td>
                    <td>${row.collection_date || '-'}</td>
                    <td>${row.longitude !== null ? row.longitude : '-'}</td>
                    <td>${row.latitude !== null ? row.latitude : '-'}</td>
                    <td>${row.soil_Pb !== null ? row.soil_Pb : '-'}</td>
                    <td>${row.soil_Cd !== null ? row.soil_Cd : '-'}</td>
                    <td>${row.herb_Pb !== null ? row.herb_Pb : '-'}</td>
                    <td>${row.herb_Cd !== null ? row.herb_Cd : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      ${statsHtml}
    </div>
  `;

  document.getElementById('app').innerHTML = html;
}

function renderCompare() {
  const herbs = getUniqueHerbs(allData);
  const herbNames = herbs.map(h => h.name);

  const indicators = [
    { key: 'soil_pH', label: '土壤pH' },
    { key: 'soil_Cr', label: '土壤铬(mg/kg)' },
    { key: 'soil_Ni', label: '土壤镍(mg/kg)' },
    { key: 'soil_Cu', label: '土壤铜(mg/kg)' },
    { key: 'soil_Zn', label: '土壤锌(mg/kg)' },
    { key: 'soil_As', label: '土壤砷(mg/kg)' },
    { key: 'soil_Cd', label: '土壤镉(mg/kg)' },
    { key: 'soil_Hg', label: '土壤汞(mg/kg)' },
    { key: 'soil_Pb', label: '土壤铅(mg/kg)' },
    { key: 'herb_Cr', label: '药材铬(mg/kg)' },
    { key: 'herb_Ni', label: '药材镍(mg/kg)' },
    { key: 'herb_Cu', label: '药材铜(mg/kg)' },
    { key: 'herb_Zn', label: '药材锌(mg/kg)' },
    { key: 'herb_As', label: '药材砷(mg/kg)' },
    { key: 'herb_Cd', label: '药材镉(mg/kg)' },
    { key: 'herb_Hg', label: '药材汞(mg/kg)' },
    { key: 'herb_Pb', label: '药材铅(mg/kg)' }
  ];

  const html = `
    <div class="controls-panel">
      <div class="control-group">
        <label>选择指标：</label>
        <select id="indicatorSelect">
          ${indicators.map(ind => `<option value="${ind.key}">${ind.label}</option>`).join('')}
        </select>
      </div>
      <div class="control-group">
        <label>选择中药材：</label>
        <div class="checkbox-group" id="herbCheckboxes">
          ${herbNames.map(name => `
            <label>
              <input type="checkbox" value="${name}">
              ${name}
            </label>
          `).join('')}
        </div>
      </div>
      <div class="control-group">
        <button id="generateChart">生成图表</button>
      </div>
    </div>
    <div class="chart-container" style="display: none;">
      <canvas id="chartCanvas" class="chart-canvas"></canvas>
      <div class="chart-table">
        <h3>数据表</h3>
        <div class="table-container">
          <table id="chartTable">
            <thead>
              <tr>
                <th>中药材名称</th>
                <th>样点数</th>
                <th>均值</th>
              </tr>
            </thead>
            <tbody id="chartTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('app').innerHTML = html;

  document.getElementById('generateChart').addEventListener('click', () => {
    const indicator = document.getElementById('indicatorSelect').value;
    const selectedHerbs = Array.from(document.querySelectorAll('#herbCheckboxes input:checked'))
      .map(cb => cb.value);

    if (selectedHerbs.length === 0) {
      alert('请至少选择一个中药材');
      return;
    }

    generateBarChart(indicator, selectedHerbs);
  });
}

function generateBarChart(indicator, selectedHerbs) {
  console.log('生成图表 - 指标:', indicator, '中药材:', selectedHerbs);

  const chartData = [];

  selectedHerbs.forEach(herbName => {
    const herbRows = allData.filter(row => row.herb_name === herbName);
    const values = herbRows.map(row => row[indicator]).filter(v => v !== null && v !== undefined && !isNaN(v));

    if (values.length > 0) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      chartData.push({
        name: herbName,
        count: herbRows.length,
        mean: parseFloat(mean.toFixed(2))
      });
    }
  });

  console.log('图表数据:', chartData);

  if (chartData.length === 0) {
    alert('所选中药材在该指标下没有有效数据');
    return;
  }

  document.querySelector('.chart-container').style.display = 'block';

  const canvas = document.getElementById('chartCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = 400;

  const padding = { top: 40, right: 40, bottom: 80, left: 60 };
  const chartWidth = canvas.width - padding.left - padding.right;
  const chartHeight = canvas.height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const maxValue = Math.max(...chartData.map(d => d.mean));
  const barWidth = chartWidth / chartData.length * 0.7;
  const barSpacing = chartWidth / chartData.length;

  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);

  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (chartHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#666';
  ctx.font = '12px Arial';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const value = maxValue - (maxValue / 5) * i;
    const y = padding.top + (chartHeight / 5) * i;
    ctx.fillText(value.toFixed(2), padding.left - 10, y + 4);
  }

  ctx.fillStyle = '#3498db';
  chartData.forEach((item, index) => {
    const barHeight = (item.mean / maxValue) * chartHeight;
    const x = padding.left + barSpacing * index + (barSpacing - barWidth) / 2;
    const y = padding.top + chartHeight - barHeight;

    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#333';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(item.mean.toString(), x + barWidth / 2, y - 5);
    ctx.fillStyle = '#3498db';
  });

  ctx.fillStyle = '#333';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  chartData.forEach((item, index) => {
    const x = padding.left + barSpacing * index + barSpacing / 2;
    const y = padding.top + chartHeight + 20;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(item.name, 0, 0);
    ctx.restore();
  });

  const indicatorLabels = {
    soil_pH: '土壤pH', soil_Cr: '土壤铬', soil_Ni: '土壤镍', soil_Cu: '土壤铜',
    soil_Zn: '土壤锌', soil_As: '土壤砷', soil_Cd: '土壤镉', soil_Hg: '土壤汞', soil_Pb: '土壤铅',
    herb_Cr: '药材铬', herb_Ni: '药材镍', herb_Cu: '药材铜', herb_Zn: '药材锌',
    herb_As: '药材砷', herb_Cd: '药材镉', herb_Hg: '药材汞', herb_Pb: '药材铅'
  };

  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(indicatorLabels[indicator] || indicator, canvas.width / 2, 20);

  const tableBody = document.getElementById('chartTableBody');
  tableBody.innerHTML = chartData.map(item => `
    <tr>
      <td>${item.name}</td>
      <td>${item.count}</td>
      <td>${item.mean}</td>
    </tr>
  `).join('');

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let hoveredIndex = -1;
    chartData.forEach((item, index) => {
      const barHeight = (item.mean / maxValue) * chartHeight;
      const barX = padding.left + barSpacing * index + (barSpacing - barWidth) / 2;
      const barY = padding.top + chartHeight - barHeight;

      if (x >= barX && x <= barX + barWidth && y >= barY && y <= barY + barHeight) {
        hoveredIndex = index;
      }
    });

    if (hoveredIndex >= 0) {
      canvas.style.cursor = 'pointer';
      canvas.title = `${chartData[hoveredIndex].name}: ${chartData[hoveredIndex].mean}`;
    } else {
      canvas.style.cursor = 'default';
      canvas.title = '';
    }
  });
}

function renderMap() {
  const validData = allData.filter(row =>
    row.longitude !== null && row.longitude !== undefined &&
    row.latitude !== null && row.latitude !== undefined &&
    !isNaN(row.longitude) && !isNaN(row.latitude)
  );

  console.log('地图数据 - 有效坐标点:', validData.length, '/', allData.length);

  const html = `
    <div class="map-container">
      <div class="map-toggle">
        <label>
          <input type="radio" name="mapMode" value="offline" checked>
          离线经纬度散点图
        </label>
        <label>
          <input type="radio" name="mapMode" value="online">
          在线地图(Leaflet)
        </label>
      </div>
      <div id="offlineMapContainer">
        <canvas id="mapCanvas" class="map-canvas"></canvas>
      </div>
      <div id="onlineMapContainer" style="display:none;"></div>
    </div>
  `;

  document.getElementById('app').innerHTML = html;

  document.querySelectorAll('input[name="mapMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'offline') {
        document.getElementById('offlineMapContainer').style.display = 'block';
        document.getElementById('onlineMapContainer').style.display = 'none';
        renderOfflineMap(validData);
      } else {
        document.getElementById('offlineMapContainer').style.display = 'none';
        document.getElementById('onlineMapContainer').style.display = 'block';
        renderLeafletMap('onlineMapContainer', validData);
      }
    });
  });

  renderOfflineMap(validData);
}

function renderOfflineMap(data) {
  if (data.length === 0) {
    document.getElementById('offlineMapContainer').innerHTML = '<div class="empty-state">没有有效的坐标数据</div>';
    return;
  }

  const canvas = document.getElementById('mapCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = 600;

  const padding = { top: 40, right: 40, bottom: 40, left: 60 };
  const chartWidth = canvas.width - padding.left - padding.right;
  const chartHeight = canvas.height - padding.top - padding.bottom;

  const lons = data.map(d => d.longitude);
  const lats = data.map(d => d.latitude);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  console.log('坐标范围 - 经度:', minLon, '-', maxLon, '纬度:', minLat, '-', maxLat);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#f0f8ff';
  ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);

  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = padding.left + (chartWidth / 10) * i;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + chartHeight);
    ctx.stroke();

    const y = padding.top + (chartHeight / 10) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#333';
  ctx.font = '11px Arial';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 5; i++) {
    const lon = minLon + (maxLon - minLon) * (i / 5);
    const x = padding.left + (chartWidth / 5) * i;
    ctx.fillText(lon.toFixed(2), x, canvas.height - 10);
  }

  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const lat = maxLat - (maxLat - minLat) * (i / 5);
    const y = padding.top + (chartHeight / 5) * i;
    ctx.fillText(lat.toFixed(2), padding.left - 10, y + 4);
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip-popup';
  tooltip.style.display = 'none';
  document.body.appendChild(tooltip);

  const points = data.map(row => {
    const x = padding.left + ((row.longitude - minLon) / (maxLon - minLon)) * chartWidth;
    const y = padding.top + chartHeight - ((row.latitude - minLat) / (maxLat - minLat)) * chartHeight;
    return { x, y, data: row };
  });

  ctx.fillStyle = '#e74c3c';
  points.forEach(point => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let found = null;
    for (const point of points) {
      const dist = Math.sqrt((mouseX - point.x) ** 2 + (mouseY - point.y) ** 2);
      if (dist < 8) {
        found = point;
        break;
      }
    }

    if (found) {
      const row = found.data;
      tooltip.innerHTML = `
        <strong>${row.herb_name || '-'}</strong><br>
        城市: ${row.city || '-'}<br>
        乡镇: ${row.town || '-'}<br>
        采样日期: ${row.collection_date || '-'}
      `;
      tooltip.style.display = 'block';
      tooltip.style.left = e.clientX + 10 + 'px';
      tooltip.style.top = e.clientY + 10 + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
}

let currentLeafletMap = null;

function renderLeafletMap(containerId, rows) {
  const mount = document.getElementById(containerId);
  if (!mount) {
    console.error('容器不存在:', containerId);
    return;
  }

  if (currentLeafletMap) {
    currentLeafletMap.remove();
    currentLeafletMap = null;
  }

  mount.innerHTML = '';
  const mapDiv = document.createElement('div');
  mapDiv.id = 'leaflet-map-instance';
  mapDiv.style.width = '100%';
  mapDiv.style.height = '520px';
  mount.appendChild(mapDiv);

  if (typeof L === 'undefined') {
    mapDiv.innerHTML = '<div class="empty-state">Leaflet 库未加载，请刷新页面重试</div>';
    return;
  }

  currentLeafletMap = L.map('leaflet-map-instance', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(currentLeafletMap);

  const markers = [];
  rows.forEach(r => {
    const lon = Number(r.longitude);
    const lat = Number(r.latitude);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

    const popupHtml = `
      <div style="line-height:1.5">
        <div><b>中药材</b>：${r.herb_name || '-'}</div>
        <div><b>城市</b>：${r.city || '-'}</div>
        <div><b>乡镇</b>：${r.town || '-'}</div>
        <div><b>采样日期</b>：${r.collection_date || '-'}</div>
      </div>
    `;

    const marker = L.circleMarker([lat, lon], {
      radius: 6,
      fillColor: '#e74c3c',
      color: '#c0392b',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    });
    marker.bindPopup(popupHtml);
    marker.addTo(currentLeafletMap);
    markers.push(marker);
  });

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    currentLeafletMap.fitBounds(group.getBounds().pad(0.2));
  } else {
    currentLeafletMap.setView([35, 105], 4);
  }
}

function router() {
  const hash = window.location.hash || '#/home';
  currentRoute = hash;

  if (hash === '#/home') {
    renderHome();
  } else if (hash === '#/table') {
    renderTable();
  } else if (hash === '#/compare') {
    renderCompare();
  } else if (hash === '#/map') {
    renderMap();
  } else if (hash.startsWith('#/herb/')) {
    const herbName = hash.substring(7);
    renderHerbDetail(herbName);
  } else {
    window.location.hash = '#/home';
  }
}

function navigateTo(hash) {
  window.location.hash = hash;
}

window.addEventListener('hashchange', router);

async function init() {
  try {
    allData = await loadCSV();
    router();
  } catch (error) {
    document.getElementById('app').innerHTML = `
      <div class="error">
        <h3>加载失败</h3>
        <p>${error.message}</p>
        <p>请确保 data.csv 文件与 index.html 在同一目录下。</p>
      </div>
    `;
  }
}

init();
