# 상세 페이지 미디어 크기 설정 가이드

상세 페이지의 이미지와 동영상 크기는 CSS 파일을 직접 수정하지 않고, 각 HTML 태그의 `style` 속성에서 개별적으로 설정합니다.

기본 원칙:

- PC 높이는 `--detail-media-height-pc` 로 직접 지정합니다.
- Tablet 높이는 `--detail-media-tablet-ratio` 비율로 계산됩니다.
- Phone 높이는 `--detail-media-phone-ratio` 비율로 계산됩니다.

예시:

```html
style="--detail-media-height-pc: 600px; --detail-media-tablet-ratio: 0.8; --detail-media-phone-ratio: 0.6;"
```

위 예시의 실제 적용 높이:

- PC: `600px`
- Tablet: `600 x 0.8 = 480px`
- Phone: `600 x 0.6 = 360px`

## 이미지 설정 방법

이미지는 아래처럼 `img` 태그에 직접 설정합니다.

필수 클래스:

- `detail-image-size`
- `detail-media-size`

예시:

```html
<figure>
  <img
    src="https://media.bithappen.kr/images/sample.webp"
    alt="이미지 설명"
    class="detail-image-size detail-media-size"
    style="--detail-media-height-pc: 600px; --detail-media-tablet-ratio: 0.8; --detail-media-phone-ratio: 0.6;"
  />
  <figcaption>이미지 설명</figcaption>
</figure>
```

## 동영상 설정 방법

동영상은 `video` 태그 자체가 아니라 바깥 래퍼에 크기를 설정합니다.

필수 클래스:

- `detail-editor-video`
- `detail-media-size`

예시:

```html
<div
  class="detail-editor-video detail-media-size"
  style="--detail-media-height-pc: 600px; --detail-media-tablet-ratio: 0.8; --detail-media-phone-ratio: 0.6;"
>
  <video controls playsinline preload="metadata" src="https://media.bithappen.kr/videos/sample.mp4">
    <source src="https://media.bithappen.kr/videos/sample.mp4" type="video/mp4" />
  </video>
</div>
<p>동영상 설명</p>
```

## 최소 설정만 할 때

PC 높이만 정하고 비율은 기본값을 쓰고 싶으면 아래처럼 작성하면 됩니다.

```html
style="--detail-media-height-pc: 600px;"
```

기본 비율:

- Tablet: `0.8`
- Phone: `0.62`

## 권장 사용법

- 큰 대표 이미지: `--detail-media-height-pc: 520px;`
- 일반 본문 이미지: `--detail-media-height-pc: 360px;`
- 본문 동영상: `--detail-media-height-pc: 360px;`
- 강조용 큰 동영상: `--detail-media-height-pc: 480px;`

## 표(table) 정렬 방법

`<figure class="table">` 의 `style` 속성에서 `margin` 으로 정렬합니다.

`alignment` 는 CSS 속성이 아니므로 사용하지 않습니다.

| 정렬 | style 값 |
|---|---|
| 왼쪽 (기본) | 그대로 두면 됨 |
| 가운데 | `margin-left: auto; margin-right: auto;` |
| 오른쪽 | `margin-left: auto; margin-right: 0;` |

예시 (오른쪽 정렬, 너비 600px):

```html
<figure class="table" style="margin-left: auto; margin-right: 0; width: 600px;">
  <table>
    <tbody>
      <tr>
        <td>내용</td>
      </tr>
    </tbody>
  </table>
</figure>
```

예시 (가운데 정렬):

```html
<figure class="table" style="margin-left: auto; margin-right: auto; width: 600px;">
  <table>
    ...
  </table>
</figure>
```

## 표 안 이미지 자동 맞춤

표 셀(`<td>`) 안에 넣은 이미지는 자동으로 셀 너비에 맞춰 표시됩니다.

별도 크기 지정이 필요 없습니다. 표의 너비를 조절하면 이미지도 따라 줄어듭니다.

```html
<figure class="table" style="width: 600px;">
  <table>
    <tbody>
      <tr>
        <td><img src="https://media.bithappen.kr/images/sample.webp" /></td>
        <td><img src="https://media.bithappen.kr/images/sample2.webp" /></td>
      </tr>
    </tbody>
  </table>
</figure>
```

## 표 라인(테두리) 숨기기

`<table>` 태그에 `borderless` 클래스를 추가하면 모든 테두리가 사라집니다.

```html
<figure class="table" style="width: 600px;">
  <table class="borderless">
    <tbody>
      <tr>
        <td><img src="https://media.bithappen.kr/images/a.webp" /></td>
        <td><img src="https://media.bithappen.kr/images/b.webp" /></td>
        <td><img src="https://media.bithappen.kr/images/c.webp" /></td>
      </tr>
    </tbody>
  </table>
</figure>
```

이미지를 나란히 보여주고 싶을 때 `borderless` 표를 활용하면 깔끔합니다.

## 주의 사항

- 이미지에는 반드시 `detail-image-size detail-media-size` 클래스를 같이 넣어야 합니다.
- 동영상은 반드시 바깥 래퍼 `div.detail-editor-video.detail-media-size` 에 `style`을 넣어야 합니다.
- 표 정렬은 `alignment` 가 아니라 `margin-left` / `margin-right` 로 설정합니다.
- 미디어가 너무 커서 모바일 화면에서 부담되면 `--detail-media-phone-ratio` 값을 더 작게 조정하면 됩니다.